/**
 * The audit flush must never block on, or lose a batch to, the pricing module: if it cannot load,
 * entries are written with their provider-reported cost, or 0.
 */
import type { IntelligenceAuditLogEntry } from '../intelligence-audit-logger'
import { describe, expect, it, vi } from 'vitest'
import '../intelligence-test-harness'
import { IntelligenceAuditLogger } from '../intelligence-audit-logger'

vi.mock('./model-pricing', () => {
  throw new Error('pricing module failed to load')
})

function entry(traceId: string, cost?: number): IntelligenceAuditLogEntry {
  return {
    traceId,
    timestamp: Date.parse('2026-10-03T08:00:00.000Z'),
    capabilityId: 'text.chat',
    provider: 'openai-default',
    model: 'gpt-4o',
    usage: { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000, cost },
    latency: 5,
    success: true
  }
}

describe('audit flush without pricing', () => {
  it('writes the batch with reported cost or 0 instead of failing', async () => {
    const logger = new IntelligenceAuditLogger()
    const written: IntelligenceAuditLogEntry[] = []
    const internals = logger as unknown as {
      flushBatch: (logs: IntelligenceAuditLogEntry[]) => Promise<boolean>
    }
    internals.flushBatch = vi.fn(async (logs: IntelligenceAuditLogEntry[]) => {
      written.push(...logs)
      return true
    })

    try {
      await logger.log(entry('trace-catalog-priced'))
      await logger.log(entry('trace-provider-reported', 0.25))
      await logger.log({ ...entry('trace-explicit'), estimatedCost: 0.5 })
      await logger.flushToDB()

      expect(written.map((log) => [log.traceId, log.estimatedCost])).toEqual([
        ['trace-catalog-priced', 0],
        ['trace-provider-reported', 0.25],
        ['trace-explicit', 0.5]
      ])
    } finally {
      await logger.destroy()
    }
  })
})
