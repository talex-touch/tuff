import { describe, expect, it } from 'vitest'
import { insightsFixture } from './audit-fixtures'
import { zeroCostModelsWithUsage } from './audit-zero-cost'

describe('zeroCostModelsWithUsage', () => {
  it('keeps the models whose calls used tokens, and drops failure-only ones', () => {
    const base = insightsFixture()
    const failureOnly = {
      ...base.breakdown.model[2]!,
      key: JSON.stringify(['custom-1', 'unknown']),
      providerId: 'custom-1',
      model: 'unknown',
      requestCount: 2,
      failureCount: 2,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    }
    const insights = {
      ...base,
      breakdown: { ...base.breakdown, model: [...base.breakdown.model, failureOnly] },
      zeroCostModels: [
        ...base.zeroCostModels,
        { providerId: 'custom-1', model: 'unknown', status: 'unpriced' as const, requestCount: 2 }
      ]
    }
    expect(zeroCostModelsWithUsage(insights).map((entry) => entry.model)).toEqual([
      'qwen2.5:3b',
      'mystery-model-9'
    ])
  })

  it('keeps a model it cannot check: no record is not proof of no tokens', () => {
    const base = insightsFixture()
    const insights = {
      ...base,
      breakdown: { ...base.breakdown, model: [] },
      zeroCostModels: base.zeroCostModels
    }
    expect(zeroCostModelsWithUsage(insights)).toHaveLength(2)
  })
})
