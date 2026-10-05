/**
 * Pending global usage (`GlobalUsageDeltas`) and the consistent read that merges it with stored
 * rows (`readGlobalUsage`).
 */
import type { IntelligenceAuditLogEntry } from '../intelligence-audit-logger'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyUsageDelta, GlobalUsageDeltas } from './global-deltas'
import { readGlobalUsage } from './global-usage'

const originalTimeZone = process.env.TZ

function entry(overrides: Partial<IntelligenceAuditLogEntry> = {}): IntelligenceAuditLogEntry {
  return {
    traceId: `trace-${Math.random().toString(16).slice(2)}`,
    // 08:30 on 2026-10-03 in Shanghai.
    timestamp: Date.parse('2026-10-03T00:30:00.000Z'),
    capabilityId: 'text.chat',
    provider: 'openai-default',
    model: 'gpt-4o',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latency: 100,
    success: true,
    ...overrides
  }
}

const DAY = 'day:2026-10-03'
const MONTH = 'month:2026-10'

beforeEach(() => {
  process.env.TZ = 'Asia/Shanghai'
})

afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

describe('GlobalUsageDeltas', () => {
  it('counts logged entries in their local day and month until they are settled', () => {
    const deltas = new GlobalUsageDeltas()
    const first = entry()
    const failed = entry({ success: false, latency: 300, estimatedCost: 0.25 })
    deltas.add(first)
    deltas.add(failed)

    expect(deltas.snapshot([DAY, MONTH, 'day:2026-10-02'])).toEqual(
      new Map([
        [
          DAY,
          {
            requestCount: 2,
            successCount: 1,
            failureCount: 1,
            promptTokens: 20,
            completionTokens: 10,
            totalTokens: 30,
            totalCost: 0.25,
            latencySum: 400
          }
        ],
        [
          MONTH,
          {
            requestCount: 2,
            successCount: 1,
            failureCount: 1,
            promptTokens: 20,
            completionTokens: 10,
            totalTokens: 30,
            totalCost: 0.25,
            latencySum: 400
          }
        ],
        ['day:2026-10-02', emptyUsageDelta()]
      ])
    )

    const version = deltas.version
    deltas.settle([first])
    expect(deltas.version).toBe(version + 1)
    expect(deltas.snapshot([DAY]).get(DAY)?.requestCount).toBe(1)
    deltas.discard([failed])
    expect(deltas.size).toBe(0)
  })

  it('reads the price the flush assigns before its transaction', () => {
    const deltas = new GlobalUsageDeltas()
    const pending = entry()
    deltas.add(pending)
    expect(deltas.snapshot([DAY]).get(DAY)?.totalCost).toBe(0)

    pending.estimatedCost = 0.0875
    expect(deltas.snapshot([DAY]).get(DAY)?.totalCost).toBe(0.0875)
  })

  it('ignores outer agent and workflow rows, and keeps periods fixed at log time', () => {
    const deltas = new GlobalUsageDeltas()
    deltas.add(entry({ capabilityId: 'agent.run' }))
    deltas.add(entry({ capabilityId: 'workflow.execute' }))
    expect(deltas.size).toBe(0)
    expect(deltas.contributionOf(entry({ capabilityId: 'agent.run' }))).toBeNull()

    const logged = entry()
    deltas.add(logged)
    process.env.TZ = 'America/Los_Angeles'
    // Still the Shanghai day it was logged in: the flush writes exactly what settle removes.
    expect(deltas.contributionOf(logged)).toEqual({ dayPeriod: DAY, monthPeriod: MONTH })
    // An entry that was never added is keyed now, in the current zone.
    expect(deltas.contributionOf(entry())).toEqual({
      dayPeriod: 'day:2026-10-02',
      monthPeriod: 'month:2026-10'
    })
  })

  it('settling an entry twice changes nothing the second time', () => {
    const deltas = new GlobalUsageDeltas()
    const once = entry()
    deltas.add(once)
    deltas.settle([once])
    const version = deltas.version
    deltas.settle([once])
    expect(deltas.version).toBe(version)
  })
})

describe('readGlobalUsage', () => {
  function storedDb(rows: () => Array<Record<string, unknown>>, onRead?: () => void) {
    const chain = {
      from: () => chain,
      where: async () => {
        onRead?.()
        return rows()
      }
    }
    return { select: () => chain } as never
  }

  it('merges stored rows with pending entries and fills every requested period', async () => {
    const deltas = new GlobalUsageDeltas()
    deltas.add(entry())
    const db = storedDb(() => [
      {
        period: DAY,
        requestCount: 4,
        successCount: 4,
        failureCount: 0,
        promptTokens: 40,
        completionTokens: 20,
        totalTokens: 60,
        totalCost: 1,
        avgLatency: 50
      }
    ])

    const usage = await readGlobalUsage(db, deltas, [DAY, 'day:2026-10-01'])
    expect(usage.get(DAY)).toEqual({
      requestCount: 5,
      successCount: 5,
      failureCount: 0,
      promptTokens: 50,
      completionTokens: 25,
      totalTokens: 75,
      totalCost: 1,
      latencySum: 300
    })
    expect(usage.get('day:2026-10-01')).toEqual(emptyUsageDelta())
  })

  it('reads again when a flush commits during the read, so the call counts once', async () => {
    const deltas = new GlobalUsageDeltas()
    const inFlight = entry()
    deltas.add(inFlight)
    let committed = false
    let reads = 0
    const db = storedDb(
      () => [
        {
          period: DAY,
          requestCount: committed ? 1 : 0,
          successCount: committed ? 1 : 0,
          failureCount: 0,
          promptTokens: committed ? 10 : 0,
          completionTokens: committed ? 5 : 0,
          totalTokens: committed ? 15 : 0,
          totalCost: 0,
          avgLatency: committed ? 100 : 0
        }
      ],
      () => {
        reads += 1
        // The first read sees the database before the commit; the flush then settles.
        if (reads === 1) {
          queueMicrotask(() => deltas.settle([inFlight]))
        } else {
          committed = true
        }
      }
    )

    const usage = await readGlobalUsage(db, deltas, [DAY])
    expect(reads).toBe(2)
    expect(usage.get(DAY)?.requestCount).toBe(1)
  })
})
