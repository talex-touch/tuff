/**
 * The name of each usage limit, the way Audit shows it (「每日请求数」, "Requests per day"). One
 * map for the limits card, the limits drawer and the file-index pause chip, so no surface prints
 * the stored key.
 *
 * No path alias and no framework import here, on purpose: the file-index diagnostics display that
 * reads it also runs under Node + tsx (`scripts/settings-indexing-diagnostics-verify.ts`), where
 * `~/` does not resolve. `audit-labels` re-exports it for the audit page.
 */
import type { UsageLimits } from '@talex-touch/utils/transport/sdk/domains/intelligence'

export const USAGE_LIMIT_LABEL_KEYS: Readonly<Record<keyof UsageLimits, string>> = Object.freeze({
  requestsPerDay: 'intelligenceAudit.limits.items.requestsPerDay',
  requestsPerMonth: 'intelligenceAudit.limits.items.requestsPerMonth',
  tokensPerDay: 'intelligenceAudit.limits.items.tokensPerDay',
  tokensPerMonth: 'intelligenceAudit.limits.items.tokensPerMonth',
  costUsdPerDay: 'intelligenceAudit.limits.items.costUsdPerDay',
  costUsdPerMonth: 'intelligenceAudit.limits.items.costUsdPerMonth'
})

/** A stored limit key's label key; `null` for a key this build does not name. */
export function usageLimitLabelKey(key: string): string | null {
  return Object.hasOwn(USAGE_LIMIT_LABEL_KEYS, key)
    ? USAGE_LIMIT_LABEL_KEYS[key as keyof UsageLimits]
    : null
}
