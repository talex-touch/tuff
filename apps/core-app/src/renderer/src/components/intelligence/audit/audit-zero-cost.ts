/**
 * The zero-cost models worth naming next to an estimated cost.
 *
 * The ledger lists every model in the window whose calls add nothing to the estimate (D13). A model
 * whose calls used no tokens at all — the failed calls a channel answered with an error, which the
 * ledger records under model `unknown` — would add nothing at any price: naming it says the
 * estimate is missing something when it is not. Those are left out. A model with no breakdown row
 * to check (its calls kept no records) stays in: absence of evidence is not a zero.
 */
import type { UsageInsights } from '@talex-touch/utils/transport/sdk/domains/intelligence'

export function zeroCostModelsWithUsage(
  insights: Pick<UsageInsights, 'zeroCostModels' | 'breakdown'>
): UsageInsights['zeroCostModels'] {
  const tokensByModel = new Map<string, number>()
  for (const row of insights.breakdown.model) {
    const key = JSON.stringify([row.providerId, row.model])
    tokensByModel.set(key, (tokensByModel.get(key) ?? 0) + row.totalTokens)
  }
  return insights.zeroCostModels.filter((entry) => {
    const tokens = tokensByModel.get(JSON.stringify([entry.providerId, entry.model]))
    return tokens === undefined || tokens > 0
  })
}
