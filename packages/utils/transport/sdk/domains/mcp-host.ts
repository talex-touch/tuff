import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'

/**
 * Tuff as a *server* for other agents.
 *
 * The neighbouring `mcp-servers` domain is the other direction: servers Tuff
 * itself connects out to. This one publishes Tuff's own tools over MCP so an
 * editor or terminal agent on the same machine can call them — and, because it
 * publishes a credential and a listening port, every event here is host-only.
 */

export interface McpHostToolView {
  name: string
  /** Written for an external model, so it explains the tool without Tuff's UI. */
  description: string
  risk: 'read' | 'write' | 'execute'
  enabled: boolean
}

export interface McpHostState {
  enabled: boolean
  /** True once the port is actually bound; `enabled` alone does not prove that. */
  running: boolean
  /** The URL to paste into a client, or null while nothing is listening. */
  endpoint: string | null
  port: number
  /** Bearer token clients must present. Host-only, like everything on this domain. */
  token: string
  tools: McpHostToolView[]
  /** Why the listener is not up, when a start failed. Cleared on success. */
  lastError?: string
}

export const McpHostEvents = {
  getState: defineEvent('mcp-host')
    .module('api')
    .event('get-state')
    .define<void, McpHostState>(),
  /** Turning this on is what binds the port; off closes it. */
  setEnabled: defineEvent('mcp-host')
    .module('api')
    .event('set-enabled')
    .define<{ enabled: boolean }, McpHostState>(),
  setToolEnabled: defineEvent('mcp-host')
    .module('api')
    .event('set-tool-enabled')
    .define<{ name: string, enabled: boolean }, McpHostState>(),
  setPort: defineEvent('mcp-host')
    .module('api')
    .event('set-port')
    .define<{ port: number }, McpHostState>(),
  rotateToken: defineEvent('mcp-host')
    .module('api')
    .event('rotate-token')
    .define<void, McpHostState>(),
} as const

export interface McpHostSdk {
  getState: () => Promise<McpHostState>
  setEnabled: (enabled: boolean) => Promise<McpHostState>
  setToolEnabled: (name: string, enabled: boolean) => Promise<McpHostState>
  setPort: (port: number) => Promise<McpHostState>
  rotateToken: () => Promise<McpHostState>
}

export function createMcpHostSdk(
  transport: Pick<ITuffTransport, 'send'>,
): McpHostSdk {
  return {
    getState: () => transport.send(McpHostEvents.getState, undefined),
    setEnabled: enabled => transport.send(McpHostEvents.setEnabled, { enabled }),
    setToolEnabled: (name, enabled) => transport.send(McpHostEvents.setToolEnabled, { name, enabled }),
    setPort: port => transport.send(McpHostEvents.setPort, { port }),
    rotateToken: () => transport.send(McpHostEvents.rotateToken, undefined),
  }
}
