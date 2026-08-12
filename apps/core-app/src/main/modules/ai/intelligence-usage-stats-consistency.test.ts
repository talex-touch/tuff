/**
 * The usage-stats upserts share a transaction with the audit-log insert precisely so the rows and
 * the counters that aggregate them cannot disagree. Each bucket's upsert was wrapped in its own
 * try/catch that swallowed the error, so the transaction committed with the audit rows written
 * and the counters not advanced - and quota checks read those counters (#780).
 */
import type { IntelligenceAuditLogEntry } from './intelligence-audit-logger'
import { describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'

import { IntelligenceAuditLogger } from './intelligence-audit-logger'

interface LoggerInternals {
  updateUsageStats: (
    tx: { insert: (table: unknown) => unknown },
    logs: IntelligenceAuditLogEntry[]
  ) => Promise<void>
}

function entry(traceId: string): IntelligenceAuditLogEntry {
  return {
    traceId,
    timestamp: Date.parse('2026-02-01T10:00:00.000Z'),
    capabilityId: 'text.chat',
    provider: 'test-provider',
    model: 'test-model',
    caller: 'plugin:acme:beta',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    estimatedCost: 0.1,
    latency: 120,
    success: true
  }
}

/** An insert chain whose final onConflictDoUpdate either resolves or rejects. */
function insertChain(onFinish: () => Promise<unknown>): unknown {
  const chain = {
    values: () => chain,
    onConflictDoUpdate: () => onFinish()
  }
  return chain
}

describe('usage-stats failures roll the audit transaction back', () => {
  it('某个 bucket 的 upsert 失败时抛出,而不是让事务照常提交', async () => {
    const logger = new IntelligenceAuditLogger() as unknown as LoggerInternals
    const tx = {
      insert: () =>
        insertChain(async () => {
          throw new Error('usage stats write failed')
        })
    }

    await expect(logger.updateUsageStats(tx, [entry('a')])).rejects.toThrow(
      /usage stats write failed/
    )
  })

  it('全部成功时正常返回(不是"永远抛出")', async () => {
    const logger = new IntelligenceAuditLogger() as unknown as LoggerInternals
    const upsert = vi.fn(async () => undefined)
    const tx = { insert: () => insertChain(upsert) }

    await expect(logger.updateUsageStats(tx, [entry('a')])).resolves.toBeUndefined()
    expect(upsert).toHaveBeenCalled()
  })

  it('第一个 bucket 失败即中止,不会带着不一致的计数器继续写后面的', async () => {
    const logger = new IntelligenceAuditLogger() as unknown as LoggerInternals
    let upsertCount = 0
    const tx = {
      insert: () =>
        insertChain(async () => {
          upsertCount += 1
          throw new Error('usage stats write failed')
        })
    }

    // Two callers produce separate buckets; the throw must stop after the first.
    await expect(
      logger.updateUsageStats(tx, [entry('a'), { ...entry('b'), caller: 'plugin:acme:gamma' }])
    ).rejects.toThrow()

    expect(upsertCount).toBe(1)
  })
})
