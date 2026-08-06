import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'

/**
 * MCP server management for the settings surface.
 *
 * List / enable / disable / delete ride the orchestrator store's existing
 * imported-item channels — servers are store items like skills are. This
 * domain adds only what those channels don't carry: liveness probing and
 * creating a server by hand instead of by import.
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
} as const

export interface McpServersSdk {
  probe: (itemId: string) => Promise<McpProbeResult>
  upsertManual: (
    input: McpManualServerInput & { itemId?: string },
  ) => Promise<{ itemId: string }>
}

export function createMcpServersSdk(
  transport: Pick<ITuffTransport, 'send'>,
): McpServersSdk {
  return {
    probe: itemId => transport.send(McpServerEvents.probe, { itemId }),
    upsertManual: input => transport.send(McpServerEvents.upsertManual, input),
  }
}
