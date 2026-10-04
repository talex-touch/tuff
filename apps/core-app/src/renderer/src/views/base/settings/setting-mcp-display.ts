import type { AiImportedConfigItem } from '@talex-touch/tuff-intelligence'

/**
 * Reading and writing the hand-entered half of the MCP server list.
 *
 * A manual server is stored as an imported item like any other, so the settings surface has to
 * recover the transport shape from `normalizedProjection.mcpProfiles` — the same projection the
 * main process feeds to the MCP registry — and turn free-text form fields back into it.
 */

/** `sourceId` the main process stamps on items created through `upsertManual`. */
export const MANUAL_MCP_SOURCE_ID = 'manual'

export type McpTransportKind = 'stdio' | 'streamable-http' | 'unknown'

export interface McpTransportSummary {
  kind: McpTransportKind
  /** Command line or URL, for the row's second line. Empty when the projection carries neither. */
  detail: string
}

interface McpProfileProjection {
  transport?: {
    type?: unknown
    command?: unknown
    args?: unknown
    url?: unknown
  }
}

function firstProfile(item: AiImportedConfigItem): McpProfileProjection | null {
  const profiles = item.normalizedProjection?.mcpProfiles
  if (!Array.isArray(profiles)) return null
  for (const profile of profiles) {
    if (profile && typeof profile === 'object') return profile as McpProfileProjection
  }
  return null
}

export function resolveMcpTransport(item: AiImportedConfigItem): McpTransportSummary {
  const transport = firstProfile(item)?.transport
  if (!transport) return { kind: 'unknown', detail: '' }

  if (transport.type === 'stdio' && typeof transport.command === 'string') {
    const args = Array.isArray(transport.args)
      ? transport.args.filter((arg): arg is string => typeof arg === 'string')
      : []
    return { kind: 'stdio', detail: [transport.command, ...args].join(' ') }
  }

  if (transport.type === 'streamable-http' && typeof transport.url === 'string') {
    return { kind: 'streamable-http', detail: transport.url }
  }

  return { kind: 'unknown', detail: '' }
}

/**
 * Whether the user typed this server in rather than importing it.
 *
 * Both fields are checked because only `sourceId` is part of the manual-upsert contract; the
 * candidate id is a second, cheaper signal for items written before that contract settled.
 */
export function isManualMcpServer(item: AiImportedConfigItem): boolean {
  // Optional access despite the type: rows written before these fields settled
  // reach the renderer with them missing, and one legacy row must not blank
  // the whole settings subtree with a render-time TypeError.
  return (
    item.sourceId === MANUAL_MCP_SOURCE_ID ||
    item.sourceId?.startsWith(`${MANUAL_MCP_SOURCE_ID}:`) === true ||
    item.candidateId?.startsWith(`${MANUAL_MCP_SOURCE_ID}:`) === true
  )
}

/** Splits a command-line string, keeping quoted runs together. */
export function parseCommandArgs(value: string): string[] {
  const matches = value.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)
  return [...matches].map((match) => match[1] ?? match[2] ?? match[3] ?? '').filter(Boolean)
}

/**
 * Parses `KEY=VALUE` / `Key: value` lines into a record, dropping blanks and `#` comments.
 * Only the first separator splits, so values may contain `=` and `:`.
 */
export function parseKeyValueLines(value: string): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const rawLine of value.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.search(/[=:]/)
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    const entryValue = line.slice(separator + 1).trim()
    if (key) entries[key] = entryValue
  }
  return entries
}
