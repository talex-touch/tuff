/**
 * Binds the MCP server admin to the real store, registry and secure store, and
 * exposes its two channels. Everything the settings page does besides these two
 * calls — list, enable, disable, delete — already has an imported-item channel.
 */

import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { McpServerEvents } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { app } from 'electron'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'
import {
  getSecureStoreValue,
  isSecureStoreAvailable,
  setSecureStoreValue
} from '../../utils/secure-store'
import { aiImportedConfigRuntime, mcpProfilesFromItem } from './ai-imported-config-runtime'
import { aiOrchestratorStore } from './ai-orchestrator-store'
import { intelligenceMcpRegistry } from './intelligence-mcp-registry'
import { createMcpServerAdmin } from './mcp-server-admin'

/** Same purpose the registry reads env references back with. */
const SECRET_PURPOSE = 'ai-import-secret'

function secureStoreRoot(): string {
  return resolveRuntimeRootPath(app)
}

/**
 * Starting a server process and storing its credentials is the host's own
 * surface; a plugin reaching it would gain both behind the user's back.
 */
function assertHostOwned(context: HandlerContext): void {
  if (context.plugin) throw new Error('INTELLIGENCE_HOST_ONLY_CAPABILITY')
}

export const mcpServerAdmin = createMcpServerAdmin({
  getItem: (itemId) => aiOrchestratorStore.getImportedItem(itemId),
  persistManualItem: (input) => aiOrchestratorStore.upsertManualImportedItem(input),
  mcpProfilesFromItem,
  registerProfile: (profile) => intelligenceMcpRegistry.registerProfile(profile),
  unregisterProfile: (profileId) => intelligenceMcpRegistry.unregisterProfile(profileId),
  listServerTools: (profileId) => intelligenceMcpRegistry.listStructuredTools([profileId]),
  secureStore: {
    isAvailable: () => isSecureStoreAvailable(secureStoreRoot()),
    read: (authRef) => getSecureStoreValue(secureStoreRoot(), authRef, SECRET_PURPOSE),
    write: (authRef, value) =>
      setSecureStoreValue(secureStoreRoot(), authRef, value, SECRET_PURPOSE)
  },
  refreshRuntime: () => aiImportedConfigRuntime.refresh()
})

export function registerMcpServerAdminChannels(transport: ITuffTransportMain): () => void {
  const cleanups = [
    transport.on(McpServerEvents.probe, async (payload, context) => {
      assertHostOwned(context)
      return await mcpServerAdmin.probe(payload.itemId)
    }),
    transport.on(McpServerEvents.upsertManual, async (payload, context) => {
      assertHostOwned(context)
      return await mcpServerAdmin.upsertManual(payload)
    })
  ]
  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
