/**
 * flushBatch requeues its batch and returns false on any database error, and flushToDB's finally
 * then rescheduled with the fixed 200ms delay. pendingLogs had no cap - only memoryLogs is
 * trimmed - so a persistently failing write became a tight retry loop over an ever-growing array
 * (#779).
 */
import type { IntelligenceAuditLogEntry } from './intelligence-audit-logger'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'

import { IntelligenceAuditLogger } from './intelligence-audit-logger'

interface LoggerInternals {
  pendingLogs: IntelligenceAuditLogEntry[]
  flushPromise: Promise<void> | null
  consecutiveFlushFailures: number
  maxPendingLogs: number
  flushDelayMs: number
  maxFlushRetryDelayMs: number
  nextFlushDelayMs: () => number
  trimPendingLogs: () => void
  log: (entry: IntelligenceAuditLogEntry) => void
  flushToDB: () => Promise<void>
  flushBatch: (logs: IntelligenceAuditLogEntry[]) => Promise<boolean>
}

function createLogger(): LoggerInternals {
  return new IntelligenceAuditLogger() as unknown as LoggerInternals
}

function entry(index: number): IntelligenceAuditLogEntry {
  return {
    traceId: `trace-${index}`,
    timestamp: Date.now(),
    capabilityId: 'text.chat',
    provider: 'test-provider',
    model: 'test-model',
    caller: 'plugin:acme:beta',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    estimatedCost: 0,
    latency: 1,
    success: true
  }
}

describe('audit flush backs off and stops growing without bound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('第一次失败后的重试延迟大于固定的 200ms', () => {
    const logger = createLogger()

    expect(logger.nextFlushDelayMs()).toBe(logger.flushDelayMs)

    logger.consecutiveFlushFailures = 1
    expect(logger.nextFlushDelayMs()).toBeGreaterThan(logger.flushDelayMs)
  })

  it('退避有上限,不会退到无限长', () => {
    const logger = createLogger()

    logger.consecutiveFlushFailures = 50

    expect(logger.nextFlushDelayMs()).toBe(logger.maxFlushRetryDelayMs)
  })

  it('成功一次之后回到最短延迟(不是永久退避)', () => {
    const logger = createLogger()

    logger.consecutiveFlushFailures = 4
    expect(logger.nextFlushDelayMs()).toBeGreaterThan(logger.flushDelayMs)

    // What a successful batch does.
    logger.consecutiveFlushFailures = 0
    expect(logger.nextFlushDelayMs()).toBe(logger.flushDelayMs)
  })

  it('pendingLogs 超过上限时丢弃最旧的,而不是无限增长', () => {
    const logger = createLogger()

    for (let index = 0; index < logger.maxPendingLogs + 25; index += 1) {
      logger.pendingLogs.push(entry(index))
    }
    logger.trimPendingLogs()

    expect(logger.pendingLogs).toHaveLength(logger.maxPendingLogs)
    // Oldest-first, matching how memoryLogs is trimmed: the newest entry must survive.
    expect(logger.pendingLogs.at(-1)?.traceId).toBe(`trace-${logger.maxPendingLogs + 24}`)
    expect(logger.pendingLogs[0]?.traceId).toBe('trace-25')
  })

  it('未超过上限时一条都不丢', () => {
    const logger = createLogger()

    for (let index = 0; index < 10; index += 1) {
      logger.pendingLogs.push(entry(index))
    }
    logger.trimPendingLogs()

    expect(logger.pendingLogs).toHaveLength(10)
  })

  it('显式 flush 会等待已取走 batch 的自动 flush 完成', async () => {
    const logger = createLogger()
    let releaseFlush!: () => void
    const flushGate = new Promise<void>((resolve) => {
      releaseFlush = resolve
    })
    logger.flushBatch = vi.fn(async () => {
      await flushGate
      return true
    })
    logger.pendingLogs.push(entry(0))
    const automaticFlush = logger.flushToDB()

    let settled = false
    const explicitFlush = logger.flushToDB().then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(settled).toBe(false)

    releaseFlush()
    await Promise.all([automaticFlush, explicitFlush])
    expect(settled).toBe(true)
  })

  it('多个等待者恢复时仍只运行一个 flush drain', async () => {
    const logger = createLogger()
    let releaseFirstBatch!: () => void
    const firstBatchGate = new Promise<void>((resolve) => {
      releaseFirstBatch = resolve
    })
    let batchCalls = 0
    let activeBatches = 0
    let maxActiveBatches = 0
    logger.flushBatch = vi.fn(async () => {
      batchCalls += 1
      activeBatches += 1
      maxActiveBatches = Math.max(maxActiveBatches, activeBatches)
      if (batchCalls === 1) await firstBatchGate
      else await Promise.resolve()
      activeBatches -= 1
      return true
    })

    logger.pendingLogs.push(entry(0))
    const ownerFlush = logger.flushToDB()
    const activeOwner = logger.flushPromise
    expect(activeOwner).not.toBeNull()

    // Queue work after the current drain resolves but before both waiters resume. Without the
    // post-await re-check, both waiters splice and flush a separate batch concurrently.
    void activeOwner?.then(() => {
      for (let index = 1; index <= 40; index += 1) logger.pendingLogs.push(entry(index))
    })
    const firstWaiter = logger.flushToDB()
    const secondWaiter = logger.flushToDB()

    releaseFirstBatch()
    await Promise.all([ownerFlush, firstWaiter, secondWaiter])

    expect(logger.pendingLogs).toHaveLength(0)
    expect(batchCalls).toBe(3)
    expect(maxActiveBatches).toBe(1)
  })
})
