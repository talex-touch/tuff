import type { AiImportedConfigItem } from '@talex-touch/tuff-intelligence'
import type {
  McpManualServerInput,
  McpServerAgentSource,
  McpServerDeclaredProbeRequest,
  McpServerRow
} from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type { AiAgentId, AiImportApplyRequest } from '@talex-touch/utils/types/ai-orchestrator'

/**
 * The MCP page's rules, kept out of the component so they can be tested as rules: what a row's
 * switch does, which rows a search and an agent filter leave, how a failure is named, and how the
 * hand-entered server form maps to and from what main stores.
 *
 * A manual server is stored as an imported item like any other, so editing one recovers its
 * transport from `normalizedProjection.mcpProfiles` — the same projection the main process feeds to
 * the MCP registry — and turns the free-text form fields back into a manual input.
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

function stringArgs(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((arg): arg is string => typeof arg === 'string') : []
}

export function resolveMcpTransport(item: AiImportedConfigItem): McpTransportSummary {
  const transport = firstProfile(item)?.transport
  if (!transport) return { kind: 'unknown', detail: '' }

  if (transport.type === 'stdio' && typeof transport.command === 'string') {
    return { kind: 'stdio', detail: [transport.command, ...stringArgs(transport.args)].join(' ') }
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

/* ─── the list ─── */

/** The agents declaring a row, once each, in the order main listed their files. */
export function rowAgentIds(row: McpServerRow): AiAgentId[] {
  return [...new Set(row.agents.map((source) => source.agentId))]
}

export interface McpRowFilter {
  query: string
  agentId: AiAgentId | null
  /** The name shown for an agent, so a search for "claude" finds what Claude Code declares. */
  agentLabel: (agentId: AiAgentId) => string
}

/**
 * The rows a search and an agent filter leave, in main's order. The search reads what the row
 * shows — name, the command or address, the agents' names — case-insensitively.
 */
export function filterMcpRows(rows: readonly McpServerRow[], filter: McpRowFilter): McpServerRow[] {
  const needle = filter.query.trim().toLocaleLowerCase()
  return rows.filter((row) => {
    if (filter.agentId && !row.agents.some((source) => source.agentId === filter.agentId))
      return false
    if (!needle) return true
    const haystack = [
      row.name,
      row.summary,
      ...rowAgentIds(row).map((agentId) => filter.agentLabel(agentId))
    ]
    return haystack.some((text) => text.toLocaleLowerCase().includes(needle))
  })
}

/** How many rows Tuff runs: the bar's "n" in "n / total". */
export function enabledRowCount(rows: readonly McpServerRow[]): number {
  return rows.filter((row) => row.tuff.state === 'enabled').length
}

/* ─── the switch ─── */

/**
 * What a row's switch does.
 *
 * - `toggle`: Tuff holds a copy; the switch flips this server alone (`setServerEnabled`).
 * - `import`: Tuff holds none; switching it on imports this server alone from an agent's file.
 * - `blocked`: Tuff holds a copy that cannot run (re-authentication, a vanished source, an invalid
 *   copy), so switching it on is refused; the switch reads off and does nothing.
 */
export type McpSwitchMode = 'toggle' | 'import' | 'blocked'

export interface McpSwitchModel {
  checked: boolean
  mode: McpSwitchMode
}

export function mcpSwitchModel(row: McpServerRow): McpSwitchModel {
  if (row.tuff.state === 'enabled') return { checked: true, mode: 'toggle' }
  if (row.tuff.state === 'disabled')
    return { checked: false, mode: row.tuff.blockedReason ? 'blocked' : 'toggle' }
  return { checked: false, mode: importSourceFor(row) ? 'import' : 'blocked' }
}

/** The agent file a not-imported server is imported from: the first one that declares it. */
export function importSourceFor(row: McpServerRow): McpServerAgentSource | null {
  return row.agents[0] ?? null
}

/**
 * Importing one server of one file. Safe for a file Tuff already holds servers from, and for one
 * switched off as a whole: main merges the pick with what it holds, keeps every neighbour's switch,
 * and switches the item on (segment 1b).
 */
export function importRequestFor(
  scanId: string,
  row: McpServerRow,
  source: McpServerAgentSource,
  confirmSecretMigration: boolean
): AiImportApplyRequest {
  return {
    scanId,
    candidateIds: [source.candidateId],
    mcpServers: { [source.candidateId]: { include: [row.name] } },
    ...(confirmSecretMigration ? { confirmSecretMigration: true } : {})
  }
}

/** The credential names a row declares, for the confirmation and the drawer. Never values. */
export function mcpCredentialNames(row: McpServerRow): string[] {
  return [...row.detail.envNames, ...row.detail.headerNames]
}

/* ─── the probe ─── */

/**
 * What a row's probe starts.
 *
 * - `stored`: Tuff holds a copy; the probe starts that copy's one server (`probe`).
 * - `declared`: Tuff holds none; the probe starts the server from the first agent file that declares
 *   it (`probeDeclared`), alone, and stops it after — nothing is imported or kept, and credentials
 *   are used from memory for that one start once the user agrees.
 */
export type McpProbeTarget =
  | { mode: 'stored'; itemId: string; profileId: string }
  | { mode: 'declared'; source: McpServerAgentSource }

export function mcpProbeTarget(row: McpServerRow): McpProbeTarget | null {
  if (row.tuff.state === 'not-imported') {
    const source = importSourceFor(row)
    return source ? { mode: 'declared', source } : null
  }
  const { itemId, profileId } = row.tuff
  return itemId && profileId ? { mode: 'stored', itemId, profileId } : null
}

/** Probing the server a row shows from one agent's file: named by the scan, the file and its key. */
export function declaredProbeRequestFor(
  scanId: string,
  row: McpServerRow,
  source: McpServerAgentSource,
  confirmSecrets: boolean
): McpServerDeclaredProbeRequest {
  return {
    scanId,
    candidateId: source.candidateId,
    server: row.name,
    key: row.key,
    ...(confirmSecrets ? { confirmSecrets: true } : {})
  }
}

/** One server's last probe, as the drawer shows it. Keyed by row on the page. */
export interface McpProbeState {
  status: 'idle' | 'probing' | 'ok' | 'failed'
  toolCount?: number
  error?: string
}

/* ─── failures ─── */

/**
 * Why an import, a switch or a probe failed, as the page words it. The import channel answers with
 * bare codes (`ai-import-error-projection.ts` in main); the switch channel throws messages that start
 * with `MCP_SERVER_*:` (`resource-inventory/mcp-inventory.ts`), and the probe of a server Tuff does
 * not hold answers with an `error` that starts the same way, with the import's codes
 * (`resource-inventory/mcp-declared-probe.ts`). Anything else is `unknown`, and the page shows the
 * message it got.
 */
export type McpFailureKind =
  | 'confirmation'
  | 'reauth'
  | 'source-changed'
  | 'secure-store'
  | 'source-missing'
  | 'invalid'
  | 'not-imported'
  | 'unknown'

const FAILURE_CODES: ReadonlyArray<[string, McpFailureKind]> = [
  ['AI_IMPORT_SECRET_CONFIRMATION_REQUIRED', 'confirmation'],
  ['MCP_SERVER_REAUTH_REQUIRED', 'reauth'],
  ['AI_IMPORT_SOURCE_CHANGED', 'source-changed'],
  ['AI_IMPORT_SECURE_STORE_UNAVAILABLE', 'secure-store'],
  ['MCP_SERVER_SOURCE_MISSING', 'source-missing'],
  ['MCP_SERVER_INVALID', 'invalid'],
  ['MCP_SERVER_NOT_IMPORTED', 'not-imported']
]

export function mcpFailureKind(error: unknown): McpFailureKind {
  const code =
    error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : ''
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  for (const [prefix, kind] of FAILURE_CODES) {
    if (code === prefix || message === prefix || message.startsWith(`${prefix}:`)) return kind
  }
  return 'unknown'
}

/* ─── the hand-entered server form ─── */

export interface ManualServerDraft {
  /** Set when editing an existing manual server; `null` creates one. */
  itemId: string | null
  name: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  env: string
  url: string
  headers: string
}

export function emptyManualDraft(): ManualServerDraft {
  return {
    itemId: null,
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    env: '',
    url: '',
    headers: ''
  }
}

/** Quotes an argument that holds whitespace, so `parseCommandArgs` reads it back whole. */
export function quoteArgument(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value
}

/**
 * The edit form for a stored manual server. Read from the stored profile itself, not from a joined
 * command line, so an argument with a space survives the round trip. Credential values are never
 * read back: main keeps only references, and the form says what saving an empty field does.
 */
export function manualDraftFromItem(item: AiImportedConfigItem, name: string): ManualServerDraft {
  const draft = { ...emptyManualDraft(), itemId: item.id, name }
  const transport = firstProfile(item)?.transport
  if (transport?.type === 'streamable-http' && typeof transport.url === 'string') {
    return { ...draft, transport: 'streamable-http', url: transport.url }
  }
  if (transport?.type === 'stdio' && typeof transport.command === 'string') {
    return {
      ...draft,
      command: transport.command,
      args: stringArgs(transport.args).map(quoteArgument).join(' ')
    }
  }
  return draft
}

export function manualDraftValid(draft: ManualServerDraft): boolean {
  if (!draft.name.trim()) return false
  return draft.transport === 'stdio' ? Boolean(draft.command.trim()) : Boolean(draft.url.trim())
}

export function manualInputFromDraft(draft: ManualServerDraft): McpManualServerInput {
  const name = draft.name.trim()
  if (draft.transport === 'streamable-http') {
    const headers = parseKeyValueLines(draft.headers)
    return {
      name,
      transport: 'streamable-http',
      url: draft.url.trim(),
      ...(Object.keys(headers).length > 0 ? { headers } : {})
    }
  }
  const env = parseKeyValueLines(draft.env)
  return {
    name,
    transport: 'stdio',
    command: draft.command.trim(),
    args: parseCommandArgs(draft.args),
    ...(Object.keys(env).length > 0 ? { env } : {})
  }
}
