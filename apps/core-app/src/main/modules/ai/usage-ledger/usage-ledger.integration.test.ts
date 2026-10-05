/**
 * Usage ledger on a real migrated libSQL database, driven through the real SDK and audit logger:
 * always-on counting (AC-B1), local-day global buckets (AC-B2), outer agent rows (AC-B3), channel
 * and caller attribution (AC-B5), freshness before a flush (AC-B8), and the flush transaction's
 * all-or-nothing contract for the new global upsert.
 */
import type { Client } from '@libsql/client'
import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult
} from '@talex-touch/tuff-intelligence'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { IntelligenceAuditLogEntry } from '../intelligence-audit-logger'
import { createClient } from '@libsql/client'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'
import { intelligenceAuditLogs, intelligenceUsageStats } from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import '../intelligence-test-harness'
import { intelligenceAuditLogger } from '../intelligence-audit-logger'
import { intelligenceCapabilityRegistry } from '../intelligence-capability-registry'
import {
  setIntelligenceAutonomousRuntimeAdapter,
  setIntelligenceProviderManager,
  TuffIntelligenceSDK
} from '../intelligence-sdk'
import { createChatProvider, FakeProviderManager } from '../intelligence-test-harness'
import { GLOBAL_USAGE_CALLER_ID } from './constants'
import { dayPeriod, localDayKey, localMonthKey, monthPeriod } from './local-period'
import { getUsageInsights } from './usage-insights'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')
const originalTimeZone = process.env.TZ

let client: Client
let db: LibSQLDatabase<typeof schema>
let tempDir: string

vi.mock('../../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

interface Counts {
  requestCount: number
  successCount: number
  failureCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

const ZERO: Counts = {
  requestCount: 0,
  successCount: 0,
  failureCount: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0
}

async function bucket(callerId: string, period: string): Promise<Counts> {
  const [row] = await db
    .select()
    .from(intelligenceUsageStats)
    .where(
      and(eq(intelligenceUsageStats.callerId, callerId), eq(intelligenceUsageStats.period, period))
    )
  if (!row) return { ...ZERO }
  return {
    requestCount: row.requestCount,
    successCount: row.successCount,
    failureCount: row.failureCount,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens
  }
}

function minus(after: Counts, before: Counts): Counts {
  return {
    requestCount: after.requestCount - before.requestCount,
    successCount: after.successCount - before.successCount,
    failureCount: after.failureCount - before.failureCount,
    promptTokens: after.promptTokens - before.promptTokens,
    completionTokens: after.completionTokens - before.completionTokens,
    totalTokens: after.totalTokens - before.totalTokens
  }
}

/** The four buckets one call at `now` lands in: global local day/month, caller UTC day/month. */
async function snapshotBuckets(callerId: string, now = Date.now()) {
  const iso = new Date(now).toISOString()
  return {
    globalDay: await bucket(GLOBAL_USAGE_CALLER_ID, dayPeriod(localDayKey(now))),
    globalMonth: await bucket(GLOBAL_USAGE_CALLER_ID, monthPeriod(localMonthKey(now))),
    callerDay: await bucket(callerId, `day:${iso.slice(0, 10)}`),
    callerMonth: await bucket(callerId, `month:${iso.slice(0, 7)}`)
  }
}

async function detailRows(traceId: string) {
  return db.select().from(intelligenceAuditLogs).where(eq(intelligenceAuditLogs.traceId, traceId))
}

function chatResult(traceId: string, usage: [number, number], provider = 'upstream-reported') {
  return {
    result: 'ok',
    usage: { promptTokens: usage[0], completionTokens: usage[1], totalTokens: usage[0] + usage[1] },
    model: 'gpt-4o-mini',
    latency: 20,
    traceId,
    provider
  }
}

/** A custom channel whose provider reports some other id about itself, as many do. */
function installChannel(options: {
  id?: string
  chat?: (payload: unknown, invokeOptions: IntelligenceInvokeOptions) => Promise<unknown>
  embedding?: (payload: unknown) => Promise<unknown>
  enableAudit?: boolean
}) {
  const id = options.id ?? 'custom-ledger-channel'
  intelligenceCapabilityRegistry.clear()
  for (const capability of [
    { id: 'text.chat', type: IntelligenceCapabilityType.CHAT },
    { id: 'embedding.generate', type: IntelligenceCapabilityType.EMBEDDING },
    { id: 'agent.run', type: IntelligenceCapabilityType.AGENT }
  ]) {
    intelligenceCapabilityRegistry.register({
      ...capability,
      name: capability.id,
      description: 'usage ledger integration',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
  }
  const chat = vi.fn(
    options.chat ??
      (async () => chatResult(`trace-${Math.random().toString(16).slice(2)}`, [10, 5]))
  )
  const provider = createChatProvider(
    {
      id,
      type: IntelligenceProviderType.CUSTOM,
      name: id,
      enabled: true,
      priority: 1,
      apiKey: 'sk-test-only',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini'],
      capabilities: ['text.chat', 'embedding.generate']
    },
    chat as never
  )
  if (options.embedding) {
    ;(provider as unknown as { embedding: unknown }).embedding = vi.fn(options.embedding)
  }
  setIntelligenceProviderManager(new FakeProviderManager([provider]))
  const sdk = new TuffIntelligenceSDK({
    enableAudit: options.enableAudit ?? true,
    enableQuota: false,
    enableCache: false,
    capabilities: {
      'text.chat': { providers: [{ providerId: id, priority: 1 }] },
      'embedding.generate': { providers: [{ providerId: id, priority: 1 }] }
    }
  })
  return { sdk, chat, provider }
}

const ask = { messages: [{ role: 'user' as const, content: 'synthetic ledger request' }] }

beforeAll(async () => {
  process.env.TZ = 'Asia/Shanghai'
  tempDir = await mkdtemp(join(tmpdir(), 'tuff-usage-ledger-'))
  client = createClient({ url: `file:${join(tempDir, 'ledger.sqlite')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  // Stops the singleton's flush interval and backfill schedule: these tests flush explicitly.
  await intelligenceAuditLogger.destroy()
}, 60_000)

beforeEach(async () => {
  process.env.TZ = 'Asia/Shanghai'
  await intelligenceAuditLogger.flushToDB()
})

afterAll(async () => {
  await intelligenceAuditLogger.flushToDB()
  await dbWriteScheduler.drain()
  intelligenceCapabilityRegistry.clear()
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
  client?.close()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
}, 60_000)

describe('always-on counting (AC-B1)', () => {
  it('audit off: no detail row, but the global and per-caller buckets both count the call', async () => {
    const callerId = 'plugin:ledger-audit-off'
    const { sdk } = installChannel({
      enableAudit: false,
      chat: async () => chatResult('trace-ledger-audit-off', [12, 8])
    })
    const before = await snapshotBuckets(callerId)

    await sdk.invoke('text.chat', ask, { metadata: { caller: callerId } })
    await intelligenceAuditLogger.flushToDB()

    expect(await detailRows('trace-ledger-audit-off')).toHaveLength(0)
    const after = await snapshotBuckets(callerId)
    const one = {
      requestCount: 1,
      successCount: 1,
      failureCount: 0,
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20
    }
    expect(minus(after.globalDay, before.globalDay)).toEqual(one)
    expect(minus(after.globalMonth, before.globalMonth)).toEqual(one)
    expect(minus(after.callerDay, before.callerDay)).toEqual(one)
    expect(minus(after.callerMonth, before.callerMonth)).toEqual(one)
    // Not kept in memory either: `getRecentLogs` serves detail only.
    expect(
      intelligenceAuditLogger
        .getRecentLogs()
        .some((log) => log.traceId === 'trace-ledger-audit-off')
    ).toBe(false)
  })

  it('audit on: detail rows and both buckets advance by the same integers', async () => {
    const callerId = 'plugin:ledger-audit-on'
    const traces = ['trace-ledger-on-1', 'trace-ledger-on-2']
    let next = 0
    const { sdk } = installChannel({
      chat: async () => chatResult(traces[next++]!, next === 1 ? [30, 10] : [7, 3])
    })
    const before = await snapshotBuckets(callerId)

    await sdk.invoke('text.chat', ask, { metadata: { caller: callerId } })
    await sdk.invoke('text.chat', ask, { metadata: { caller: callerId } })
    await intelligenceAuditLogger.flushToDB()

    const rows = (await Promise.all(traces.map(detailRows))).flat()
    expect(rows).toHaveLength(2)
    const fromDetail = {
      requestCount: rows.length,
      successCount: rows.filter((row) => row.success).length,
      failureCount: rows.filter((row) => !row.success).length,
      promptTokens: rows.reduce((sum, row) => sum + row.promptTokens, 0),
      completionTokens: rows.reduce((sum, row) => sum + row.completionTokens, 0),
      totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0)
    }
    expect(fromDetail).toEqual({
      requestCount: 2,
      successCount: 2,
      failureCount: 0,
      promptTokens: 37,
      completionTokens: 13,
      totalTokens: 50
    })
    const after = await snapshotBuckets(callerId)
    expect(minus(after.globalDay, before.globalDay)).toEqual(fromDetail)
    expect(minus(after.globalMonth, before.globalMonth)).toEqual(fromDetail)
    expect(minus(after.callerDay, before.callerDay)).toEqual(fromDetail)
    expect(minus(after.callerMonth, before.callerMonth)).toEqual(fromDetail)
  })
})

describe('local-day global bucket (AC-B2)', () => {
  function entry(traceId: string, iso: string, callerId: string): IntelligenceAuditLogEntry {
    return {
      traceId,
      timestamp: Date.parse(iso),
      capabilityId: 'text.chat',
      provider: 'custom-ledger-channel',
      model: 'gpt-4o-mini',
      caller: callerId,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      estimatedCost: 0,
      latency: 5,
      success: true
    }
  }

  it('Asia/Shanghai: UTC 23:59 / 00:01 share a local day; local 23:59 / 00:01 do not', async () => {
    process.env.TZ = 'Asia/Shanghai'
    const callerId = 'plugin:ledger-tz-shanghai'
    // 07:59 and 08:01 local on 2026-08-03 — one local day across the UTC date line.
    await intelligenceAuditLogger.log(entry('tz-sh-a', '2026-08-02T23:59:00.000Z', callerId))
    await intelligenceAuditLogger.log(entry('tz-sh-b', '2026-08-03T00:01:00.000Z', callerId))
    // 23:59 local on 2026-08-05, then 00:01 local on 2026-08-06.
    await intelligenceAuditLogger.log(entry('tz-sh-c', '2026-08-05T15:59:00.000Z', callerId))
    await intelligenceAuditLogger.log(entry('tz-sh-d', '2026-08-05T16:01:00.000Z', callerId))
    await intelligenceAuditLogger.flushToDB()

    expect((await bucket(GLOBAL_USAGE_CALLER_ID, 'day:2026-08-03')).requestCount).toBe(2)
    expect((await bucket(GLOBAL_USAGE_CALLER_ID, 'day:2026-08-02')).requestCount).toBe(0)
    expect((await bucket(GLOBAL_USAGE_CALLER_ID, 'day:2026-08-05')).requestCount).toBe(1)
    expect((await bucket(GLOBAL_USAGE_CALLER_ID, 'day:2026-08-06')).requestCount).toBe(1)
    // The per-caller buckets keep their UTC keys.
    expect((await bucket(callerId, 'day:2026-08-02')).requestCount).toBe(1)
    expect((await bucket(callerId, 'day:2026-08-03')).requestCount).toBe(1)
    expect((await bucket(callerId, 'day:2026-08-05')).requestCount).toBe(2)
  })

  it('America/Los_Angeles: UTC 23:59 / 00:01 share a local day; local 23:59 / 00:01 do not', async () => {
    process.env.TZ = 'America/Los_Angeles'
    const callerId = 'plugin:ledger-tz-la'
    // 16:59 and 17:01 PDT on 2026-07-10.
    await intelligenceAuditLogger.log(entry('tz-la-a', '2026-07-10T23:59:00.000Z', callerId))
    await intelligenceAuditLogger.log(entry('tz-la-b', '2026-07-11T00:01:00.000Z', callerId))
    // 23:59 PDT on 2026-07-12, then 00:01 PDT on 2026-07-13.
    await intelligenceAuditLogger.log(entry('tz-la-c', '2026-07-13T06:59:00.000Z', callerId))
    await intelligenceAuditLogger.log(entry('tz-la-d', '2026-07-13T07:01:00.000Z', callerId))
    await intelligenceAuditLogger.flushToDB()

    expect((await bucket(GLOBAL_USAGE_CALLER_ID, 'day:2026-07-10')).requestCount).toBe(2)
    expect((await bucket(GLOBAL_USAGE_CALLER_ID, 'day:2026-07-11')).requestCount).toBe(0)
    expect((await bucket(GLOBAL_USAGE_CALLER_ID, 'day:2026-07-12')).requestCount).toBe(1)
    expect((await bucket(GLOBAL_USAGE_CALLER_ID, 'day:2026-07-13')).requestCount).toBe(1)
    expect((await bucket(GLOBAL_USAGE_CALLER_ID, 'month:2026-07')).requestCount).toBe(4)
    expect((await bucket(callerId, 'day:2026-07-10')).requestCount).toBe(1)
    expect((await bucket(callerId, 'day:2026-07-11')).requestCount).toBe(1)
    expect((await bucket(callerId, 'day:2026-07-13')).requestCount).toBe(2)
  })
})

describe('outer governance rows (AC-B3)', () => {
  it('an agent.run with two inner model calls adds 2 requests and only the inner tokens', async () => {
    const outerCaller = 'plugin:ledger-agent-runner'
    let inner = 0
    const { sdk } = installChannel({
      chat: async () => {
        inner += 1
        return chatResult(`trace-agent-inner-${inner}`, inner === 1 ? [100, 50] : [40, 10])
      }
    })
    setIntelligenceAutonomousRuntimeAdapter({
      executeAgentCapability: async () => {
        const first = await sdk.invoke('text.chat', ask, {
          metadata: { caller: 'ai-cli-orchestrator' }
        })
        const second = await sdk.invoke('text.chat', ask, {
          metadata: { caller: 'ai-cli-orchestrator' }
        })
        return {
          result: { result: 'done', steps: [], toolCalls: [], iterations: 2 },
          usage: {
            promptTokens: first.usage.promptTokens + second.usage.promptTokens,
            completionTokens: first.usage.completionTokens + second.usage.completionTokens,
            totalTokens: first.usage.totalTokens + second.usage.totalTokens
          },
          model: 'pi-agent-core',
          latency: 30,
          traceId: 'trace-agent-outer',
          provider: 'tuff-pi-runtime'
        } as IntelligenceInvokeResult<never>
      },
      executeWorkflowCapability: async () => {
        throw new Error('not used')
      }
    })
    const beforeOuter = await snapshotBuckets(outerCaller)
    const beforeInner = await snapshotBuckets('ai-cli-orchestrator')

    await sdk.invoke(
      'agent.run',
      { task: 'two model calls' },
      { metadata: { caller: outerCaller } }
    )
    await intelligenceAuditLogger.flushToDB()

    const afterOuter = await snapshotBuckets(outerCaller)
    const afterInner = await snapshotBuckets('ai-cli-orchestrator')
    // Global: the two inner calls once — not the outer row on top of them.
    expect(minus(afterOuter.globalDay, beforeOuter.globalDay)).toEqual({
      requestCount: 2,
      successCount: 2,
      failureCount: 0,
      promptTokens: 140,
      completionTokens: 60,
      totalTokens: 200
    })
    // Per caller: the outer row still records who started the run.
    expect(minus(afterOuter.callerDay, beforeOuter.callerDay)).toMatchObject({
      requestCount: 1,
      totalTokens: 200
    })
    expect(minus(afterInner.callerDay, beforeInner.callerDay)).toMatchObject({
      requestCount: 2,
      totalTokens: 200
    })
    expect(await detailRows('trace-agent-outer')).toHaveLength(1)
  })
})

describe('channel and caller attribution (AC-B5)', () => {
  it('records the custom channel config id on chat, embedding and failure rows', async () => {
    const channelId = 'custom-1790000000000'
    const { sdk, chat } = installChannel({
      id: channelId,
      chat: async () => chatResult('trace-attr-chat', [5, 5], 'gateway-reported-id'),
      // OpenAI-compatible embeddings report the channel type, not its id.
      embedding: async () => ({
        result: [0.1, 0.2],
        usage: { promptTokens: 4, completionTokens: 0, totalTokens: 4 },
        model: 'text-embedding-3-small',
        latency: 3,
        traceId: 'trace-attr-embedding',
        provider: 'custom'
      })
    })
    await sdk.invoke('text.chat', ask, { metadata: { caller: 'plugin:attr' } })
    await sdk.invoke(
      'embedding.generate',
      { text: 'embed me' },
      { metadata: { caller: 'plugin:attr' } }
    )
    chat.mockRejectedValueOnce(new Error('upstream refused'))
    await expect(
      sdk.invoke('text.chat', ask, { metadata: { caller: 'plugin:attr-failure' } })
    ).rejects.toThrow('upstream refused')
    await intelligenceAuditLogger.flushToDB()

    const [chatRow] = await detailRows('trace-attr-chat')
    const [embeddingRow] = await db
      .select()
      .from(intelligenceAuditLogs)
      .where(eq(intelligenceAuditLogs.capabilityId, 'embedding.generate'))
    const [failureRow] = await db
      .select()
      .from(intelligenceAuditLogs)
      .where(eq(intelligenceAuditLogs.caller, 'plugin:attr-failure'))
    expect(chatRow?.provider).toBe(channelId)
    expect(embeddingRow?.provider).toBe(channelId)
    expect(failureRow).toMatchObject({ provider: channelId, success: false })
  })

  it('counts a host Home turn as core.home.conversation without telling the provider', async () => {
    const { sdk, chat } = installChannel({
      chat: async () => chatResult('trace-home-turn', [9, 1])
    })
    const homeMetadata = {
      surface: 'home-conversation',
      operation: 'home-conversation',
      autoContext: true
    }

    await sdk.invoke('text.chat', ask, { metadata: homeMetadata })
    await intelligenceAuditLogger.flushToDB()

    // The Pi native-session guard refuses a Home-surface request that names a caller.
    const providerOptions = chat.mock.calls[0]?.[1] as IntelligenceInvokeOptions
    expect(providerOptions.metadata).not.toHaveProperty('caller')
    const [row] = await detailRows('trace-home-turn')
    expect(row?.caller).toBe('core.home.conversation')
  })

  it('never relabels an explicit caller, even on a Home-surface request', async () => {
    const { sdk } = installChannel({ chat: async () => chatResult('trace-home-plugin', [1, 1]) })

    await sdk.invoke('text.chat', ask, {
      metadata: { surface: 'home-conversation', caller: 'plugin:home-impersonator' }
    })
    await intelligenceAuditLogger.flushToDB()

    const [row] = await detailRows('trace-home-plugin')
    expect(row?.caller).toBe('plugin:home-impersonator')
  })
})

describe('freshness before a flush (AC-B8)', () => {
  it('getUsageInsights counts a finished call before its batch is written', async () => {
    const readToday = () =>
      getUsageInsights(
        { range: 'today' },
        {
          onPricingStale: vi.fn(),
          auditEnabled: () => true,
          readAuditRetentionMs: async () => null
        }
      )
    const { sdk } = installChannel({ chat: async () => chatResult('trace-fresh', [6, 4]) })
    const before = await readToday()

    await sdk.invoke('text.chat', ask, { metadata: { caller: 'plugin:fresh' } })

    // Not flushed: no detail row yet, and the global row has not moved.
    expect(await detailRows('trace-fresh')).toHaveLength(0)
    const pending = await readToday()
    expect(pending.totals.requestCount).toBe(before.totals.requestCount + 1)
    expect(pending.totals.totalTokens).toBe(before.totals.totalTokens + 10)

    // Once written it is counted once, not twice.
    await intelligenceAuditLogger.flushToDB()
    expect(await detailRows('trace-fresh')).toHaveLength(1)
    const flushed = await readToday()
    expect(flushed.totals.requestCount).toBe(pending.totals.requestCount)
    expect(flushed.totals.totalTokens).toBe(pending.totals.totalTokens)
  })
})

describe('flush transaction', () => {
  it('rolls the whole batch back when the global upsert fails, keeping it pending', async () => {
    const callerId = 'plugin:ledger-rollback'
    const now = Date.now()
    const today = dayPeriod(localDayKey(now))
    const internals = intelligenceAuditLogger as unknown as {
      updateGlobalUsage: (...args: unknown[]) => Promise<void>
    }
    const failGlobal = vi
      .spyOn(internals, 'updateGlobalUsage')
      .mockRejectedValueOnce(new Error('global upsert failed'))
    const before = await snapshotBuckets(callerId, now)
    const pendingBefore = (await intelligenceAuditLogger.readGlobalUsage([today])).get(today)!

    await intelligenceAuditLogger.log({
      traceId: 'trace-ledger-rollback',
      timestamp: now,
      capabilityId: 'text.chat',
      provider: 'custom-ledger-channel',
      model: 'gpt-4o-mini',
      caller: callerId,
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
      estimatedCost: 0,
      latency: 5,
      success: true
    })
    await intelligenceAuditLogger.flushToDB()

    expect(failGlobal).toHaveBeenCalledOnce()
    expect(await detailRows('trace-ledger-rollback')).toHaveLength(0)
    expect(await snapshotBuckets(callerId, now)).toEqual(before)
    // Still counted from memory while it waits for the retry.
    const whilePending = (await intelligenceAuditLogger.readGlobalUsage([today])).get(today)!
    expect(whilePending.requestCount).toBe(pendingBefore.requestCount + 1)

    await intelligenceAuditLogger.flushToDB()
    expect(await detailRows('trace-ledger-rollback')).toHaveLength(1)
    const after = await snapshotBuckets(callerId, now)
    expect(minus(after.globalDay, before.globalDay).requestCount).toBe(1)
    expect(minus(after.callerDay, before.callerDay).requestCount).toBe(1)
    const settled = (await intelligenceAuditLogger.readGlobalUsage([today])).get(today)!
    expect(settled.requestCount).toBe(whilePending.requestCount)
  })

  it('keeps caller reads free of the global row', async () => {
    const before = await intelligenceAuditLogger.getUsageStats('system', 'month')
    const beforeTotal = before.reduce((sum, row) => sum + row.requestCount, 0)
    await intelligenceAuditLogger.log({
      traceId: 'trace-ledger-no-caller',
      timestamp: Date.now(),
      capabilityId: 'text.chat',
      provider: 'custom-ledger-channel',
      model: 'gpt-4o-mini',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      estimatedCost: 0,
      latency: 5,
      success: true
    })
    await intelligenceAuditLogger.flushToDB()

    const after = await intelligenceAuditLogger.getUsageStats('system', 'month')
    expect(after.reduce((sum, row) => sum + row.requestCount, 0)).toBe(beforeTotal + 1)
  })
})

describe('privacy floor (runs last: it deletes every earlier detail row)', () => {
  it('a call that started before a privacy delete is counted but keeps no detail row', async () => {
    const callerId = 'plugin:ledger-floor'
    const startedAt = Date.now() - 1_000
    const before = await snapshotBuckets(callerId, startedAt)

    const deletedAt = Date.now()
    await intelligenceAuditLogger.cleanupRetentionPage(
      deletedAt,
      200,
      new AbortController().signal,
      undefined,
      deletedAt
    )
    await intelligenceAuditLogger.log({
      traceId: 'trace-ledger-floor',
      timestamp: startedAt,
      capabilityId: 'text.chat',
      provider: 'custom-ledger-channel',
      model: 'gpt-4o-mini',
      caller: callerId,
      usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 },
      estimatedCost: 0,
      latency: 5,
      success: true
    })
    await intelligenceAuditLogger.flushToDB()

    expect(await detailRows('trace-ledger-floor')).toHaveLength(0)
    const after = await snapshotBuckets(callerId, startedAt)
    expect(minus(after.globalDay, before.globalDay).requestCount).toBe(1)
    expect(minus(after.callerDay, before.callerDay).requestCount).toBe(1)
  })
})
