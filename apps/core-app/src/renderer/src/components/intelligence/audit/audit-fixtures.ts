/**
 * Test fixtures for the audit page: one `UsageInsights` shaped like a real 30-day answer, with a
 * Home conversation channel, a local Ollama model and a model models.dev does not list.
 *
 * Only the `*.test.ts` files beside it import this.
 */
import type {
  BreakdownRow,
  IntelligenceAuditLogEntry,
  ModelPricing,
  UsageInsights,
  UsageLimitsStatus,
  UsageTotals
} from '@talex-touch/utils/transport/sdk/domains/intelligence'

export function totalsFixture(overrides: Partial<UsageTotals> = {}): UsageTotals {
  return {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    avgLatencyMs: null,
    ...overrides
  }
}

export function limitsFixture(
  items: UsageLimitsStatus['items'] = [],
  limits: Partial<UsageLimitsStatus['limits']> = {}
): UsageLimitsStatus {
  return {
    limits: {
      requestsPerDay: null,
      requestsPerMonth: null,
      tokensPerDay: null,
      tokensPerMonth: null,
      costUsdPerDay: null,
      costUsdPerMonth: null,
      ...limits
    },
    items
  }
}

/** The next local midnight after the fixture's last day: when a daily limit resets. */
export const RESETS_AT = new Date(2026, 9, 4, 0, 0, 0).getTime()

/** One breakdown row: requests, failures, input and output tokens, estimated cost. */
function row(
  key: string,
  [requestCount, failureCount, promptTokens, completionTokens, estimatedCostUsd]: number[],
  operation?: string
): BreakdownRow {
  return {
    key,
    ...(operation ? { operation } : {}),
    requestCount: requestCount ?? 0,
    failureCount: failureCount ?? 0,
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    totalTokens: (promptTokens ?? 0) + (completionTokens ?? 0),
    estimatedCostUsd: estimatedCostUsd ?? 0
  }
}

function pricing(overrides: Partial<ModelPricing> = {}): ModelPricing {
  return {
    status: 'unpriced',
    resolvedVia: null,
    catalogProvider: null,
    catalogModel: null,
    inputPerMTokens: null,
    outputPerMTokens: null,
    contextTokens: null,
    outputLimitTokens: null,
    ...overrides
  }
}

function day(key: string, overrides: Partial<UsageTotals>): UsageInsights['days'][number] {
  return { day: key, ...totalsFixture(overrides) }
}

export function insightsFixture(overrides: Partial<UsageInsights> = {}): UsageInsights {
  return {
    timezone: 'Asia/Shanghai',
    window: {
      range: '30d',
      startDay: '2026-09-04',
      endDay: '2026-10-03',
      startMs: new Date(2026, 8, 4).getTime(),
      endMs: new Date(2026, 9, 4).getTime()
    },
    totals: totalsFixture({
      requestCount: 46,
      successCount: 44,
      failureCount: 2,
      promptTokens: 30_000,
      completionTokens: 12_000,
      totalTokens: 42_000,
      estimatedCostUsd: 0.42,
      avgLatencyMs: 850
    }),
    days: [
      day('2026-09-28', {
        requestCount: 6,
        successCount: 6,
        promptTokens: 4000,
        completionTokens: 2000,
        totalTokens: 6000,
        estimatedCostUsd: 0.06
      }),
      day('2026-10-03', {
        requestCount: 40,
        successCount: 38,
        failureCount: 2,
        promptTokens: 26_000,
        completionTokens: 10_000,
        totalTokens: 36_000,
        estimatedCostUsd: 0.36
      })
    ],
    breakdown: {
      coverage: { detailRequests: 46, totalRequests: 46 },
      channel: [
        row('custom-1', [30, 1, 20_000, 10_000, 0.42]),
        row('ollama-local', [12, 0, 8000, 1000, 0]),
        row('custom-deleted', [4, 1, 2000, 1000, 0])
      ],
      model: [
        {
          ...row(JSON.stringify(['custom-1', 'gpt-4o']), [30, 1, 20_000, 10_000, 0.42]),
          providerId: 'custom-1',
          model: 'gpt-4o',
          pricing: pricing({
            status: 'priced',
            resolvedVia: 'model-family',
            catalogProvider: 'openai',
            catalogModel: 'gpt-4o',
            inputPerMTokens: 2.5,
            outputPerMTokens: 10,
            contextTokens: 128_000,
            outputLimitTokens: 16_384
          })
        },
        {
          ...row(JSON.stringify(['ollama-local', 'qwen2.5:3b']), [12, 0, 8000, 1000, 0]),
          providerId: 'ollama-local',
          model: 'qwen2.5:3b',
          pricing: pricing({ status: 'local' })
        },
        {
          ...row(JSON.stringify(['custom-deleted', 'mystery-model-9']), [4, 1, 2000, 1000, 0]),
          providerId: 'custom-deleted',
          model: 'mystery-model-9',
          pricing: pricing({ status: 'unpriced' })
        }
      ],
      capability: [
        row('text.chat', [42, 2, 28_000, 11_000, 0.42]),
        row('embedding.generate', [4, 0, 2000, 1000, 0])
      ],
      caller: [
        row('core.home.conversation', [20, 1, 14_000, 6000, 0.3]),
        row('plugin:touch-translation', [10, 0, 6000, 4000, 0.12]),
        row('', [8, 0, 6000, 1000, 0], 'home-conversation'),
        row('', [4, 1, 2000, 1000, 0]),
        row('system', [4, 0, 2000, 0, 0])
      ]
    },
    zeroCostModels: [
      { providerId: 'ollama-local', model: 'qwen2.5:3b', status: 'local', requestCount: 12 },
      {
        providerId: 'custom-deleted',
        model: 'mystery-model-9',
        status: 'unpriced',
        requestCount: 4
      }
    ],
    limits: limitsFixture(),
    audit: {
      enabled: true,
      retentionMs: 30 * 86_400_000,
      oldestDetailMs: new Date(2026, 8, 4).getTime()
    },
    pricing: {
      source: 'models.dev',
      fetchedAt: new Date(2026, 9, 3, 9, 30).getTime(),
      checkedAt: new Date(2026, 9, 3, 9, 30).getTime(),
      available: true
    },
    ...overrides
  }
}

export function auditRowFixture(
  index: number,
  overrides: Partial<IntelligenceAuditLogEntry> = {}
): IntelligenceAuditLogEntry {
  return {
    traceId: `trace-${index}`,
    timestamp: new Date(2026, 9, 3, 12, 0, 0).getTime() - index * 60_000,
    capabilityId: 'text.chat',
    provider: 'custom-1',
    model: 'gpt-4o',
    caller: 'core.home.conversation',
    usage: { promptTokens: 700, completionTokens: 300, totalTokens: 1000 },
    latency: 900,
    success: true,
    estimatedCost: 0.0045,
    metadata: { operation: 'home-conversation' },
    ...overrides
  }
}
