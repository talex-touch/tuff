import type { AgentPresence, AiAgentId, AiImportOriginId } from '../../../types/ai-orchestrator'
import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'

/**
 * MCP server management for the settings surface.
 *
 * List / enable / disable / delete ride the orchestrator store's existing
 * imported-item channels — servers are store items like skills are. This
 * domain adds what those channels don't carry: liveness probing, creating a
 * server by hand instead of by import, and the per-server view — every server
 * this machine's agents declare, merged across agents, with Tuff's own switch
 * for each one.
 *
 * Every event is host-only: main rejects a plugin caller, and none of them is
 * plugin-facing.
 */

export interface McpProbeResult {
  ok: boolean
  /** Number of tools the server reported; present only when `ok`. */
  toolCount?: number
  /** Human-readable failure cause; present only when not `ok`. */
  error?: string
}

/** A hand-entered server definition; exactly one transport shape per entry. */
export type McpManualServerInput
  = | {
    name: string
    transport: 'stdio'
    command: string
    args?: string[]
    /** Plain values; main moves them into the secure store, never plaintext. */
    env?: Record<string, string>
  }
  | {
    name: string
    transport: 'streamable-http'
    url: string
    headers?: Record<string, string>
  }

/** What stands in for a credential wherever a server is described. */
export const MCP_SECRET_MASK = '••••••'

/** One place an agent's own configuration declares a server. */
export interface McpServerAgentSource {
  agentId: AiAgentId
  /** The configuration file, e.g. `~/.codex/config.toml`. */
  sourcePath: string
  /** The discovery candidate that file was scanned as; importing from it names this id. */
  candidateId: string
}

/** Tuff's side of a server: whether Tuff runs it, and which stored copy that is. */
export interface McpServerTuffState {
  state: 'not-imported' | 'enabled' | 'disabled'
  /** The stored copy the row's switch acts on, when there is one. */
  itemId?: string
  profileId?: string
  /** Imported from an agent's configuration, or typed into settings by hand. */
  origin?: 'imported' | 'manual'
  /** Where an imported copy came from. */
  provider?: AiImportOriginId
  /** Why the copy cannot run even when switched on; switching it on is refused. */
  blockedReason?: 'reauth-required' | 'source-missing' | 'invalid'
}

/** What the detail view shows. Never a credential: names only, values masked. */
export interface McpServerDetail {
  /** stdio only. */
  command?: string
  /** stdio only; the value after a credential-looking flag reads as {@link MCP_SECRET_MASK}. */
  args?: string[]
  /** http only; origin and path — a query string can carry a key. */
  url?: string
  /** Environment variable names. Their values never leave main. */
  envNames: string[]
  /** Header names. Their values never leave main. */
  headerNames: string[]
}

/**
 * One row of the MCP page: one server. The same name with the same command (stdio) or address
 * (http) is one server however many agents declare it; anything else is its own row.
 */
export interface McpServerRow {
  /**
   * Merge identity — name plus transport identity, hashed, so it never carries an argument value.
   * Stable across scans while the definition stays the same.
   */
  key: string
  name: string
  transport: 'stdio' | 'http'
  /** One line: the masked command line, or the address. */
  summary: string
  detail: McpServerDetail
  /** Declares credentials (env, headers, a token argument, OAuth); switching it on migrates them. */
  hasSecrets: boolean
  /** Agents whose own configuration declares it. Read-only: Tuff never edits these files. */
  agents: McpServerAgentSource[]
  tuff: McpServerTuffState
  /** Filled by the page after an explicit probe; the inventory never starts a server. */
  probe?: McpProbeResult
}

export interface McpServerInventory {
  /** The discovery scan the rows' `candidateId`s belong to. */
  scanId: string
  rows: McpServerRow[]
  /** Agents declaring at least one server, most first. `skillCount` is not counted here (null). */
  agents: AgentPresence[]
  /** Configuration files the scan found but this read could not use; their servers are missing. */
  unreadableSources: Array<{
    agentId: AiAgentId
    sourcePath: string
    reason: 'unreadable' | 'unparseable'
  }>
}

export interface McpServerSetEnabledRequest {
  /** {@link McpServerRow.key}. */
  key: string
  enabled: boolean
}

export const McpServerEvents = {
  /** Renderer → main: connect and list tools, report liveness. */
  probe: defineEvent('mcp-servers')
    .module('api')
    .event('probe')
    .define<{ itemId: string }, McpProbeResult>(),
  /** Renderer → main: create (or update by id) a manual server item. */
  upsertManual: defineEvent('mcp-servers')
    .module('api')
    .event('upsert-manual')
    .define<McpManualServerInput & { itemId?: string }, { itemId: string }>(),
  /** Renderer → main: every server on this machine and in Tuff, merged, with Tuff's switch each. */
  inventory: defineEvent('mcp-servers')
    .module('api')
    .event('inventory')
    .define<void, McpServerInventory>(),
  /**
   * Renderer → main: switch one server Tuff already holds on or off, leaving every other server of
   * the same configuration file as it was. Answers with the row's new Tuff state.
   */
  setServerEnabled: defineEvent('mcp-servers')
    .module('api')
    .event('set-server-enabled')
    .define<McpServerSetEnabledRequest, McpServerTuffState>(),
} as const

export interface McpServersSdk {
  probe: (itemId: string) => Promise<McpProbeResult>
  upsertManual: (
    input: McpManualServerInput & { itemId?: string },
  ) => Promise<{ itemId: string }>
  inventory: () => Promise<McpServerInventory>
  setServerEnabled: (key: string, enabled: boolean) => Promise<McpServerTuffState>
}

export function createMcpServersSdk(
  transport: Pick<ITuffTransport, 'send'>,
): McpServersSdk {
  return {
    probe: itemId => transport.send(McpServerEvents.probe, { itemId }),
    upsertManual: input => transport.send(McpServerEvents.upsertManual, input),
    inventory: () => transport.send(McpServerEvents.inventory, undefined),
    setServerEnabled: (key, enabled) =>
      transport.send(McpServerEvents.setServerEnabled, { key, enabled }),
  }
}
