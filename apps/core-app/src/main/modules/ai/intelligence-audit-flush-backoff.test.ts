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
  consecutiveFlushFailures: number
  maxPendingLogs: number
  flushDelayMs: number
  maxFlushRetryDelayMs: number
  nextFlushDelayMs: () => number
  trimPendingLogs: () => void
  log: (entry: IntelligenceAuditLogEntry) => void
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
})
