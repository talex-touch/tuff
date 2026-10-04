import type { AiImportedConfigItem } from '@talex-touch/tuff-intelligence'

/**
 * What the MCP-servers and skills sections of settings have in common. Both list items from the
 * same orchestrator snapshot, so they share one row budget and one way of naming an item and the
 * agent it came from.
 */

/** Row budget per section. Everything past it unfolds in place rather than leaving the page. */
export const MAX_VISIBLE_ROWS = 5

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function displayName(item: AiImportedConfigItem): string {
  return item.alias || item.name
}

/** The two lookups `agentLabel` needs; the composer `useI18n()` returns carries both. */
export interface AgentLabelI18n {
  t: (key: string) => string
  te: (key: string) => boolean
}

/** Agent names are brands; only a missing key falls back to the raw id. */
export function agentLabel(sourceId: string, i18n: AgentLabelI18n): string {
  const key = `settings.skillsMcp.sources.${sourceId}`
  return i18n.te(key) ? i18n.t(key) : sourceId
}
