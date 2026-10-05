/**
 * Binds the MCP inventory to the real discovery scan, store and runtime, and exposes its channels.
 * All are the host's own: the inventory reads the agents' configuration files, and the switch and
 * the probe of a server Tuff does not hold start or stop server processes — none of which a plugin
 * may reach.
 */

import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type {
  McpProbeResult,
  McpServerDeclaredProbeRequest,
  McpServerInventory,
  McpServerSetEnabledRequest,
  McpServerTuffState
} from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type { AiImportScanResult } from '@talex-touch/utils/types/ai-orchestrator'
import type { McpServerSwitchDeps } from './mcp-inventory'
import { McpServerEvents } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { aiCliImportService } from '../ai-cli-import-service'
import { aiImportedConfigRuntime } from '../ai-imported-config-runtime'
import { aiOrchestratorStore } from '../ai-orchestrator-store'
import { intelligenceMcpRegistry } from '../intelligence-mcp-registry'
import { probeDeclaredServer } from './mcp-declared-probe'
import { buildMcpServerInventory, loadMcpDiscovery, setMcpServerEnabled } from './mcp-inventory'

function assertHostOwned(context: HandlerContext): void {
  if (context.plugin) throw new Error('INTELLIGENCE_HOST_ONLY_CAPABILITY')
}

export interface McpInventoryRuntimeDeps extends McpServerSwitchDeps {
  /** A fresh discovery scan; recorded so a later import can name it. */
  preview: () => Promise<AiImportScanResult>
  /** Starts a server Tuff does not hold for a probe, alone, and stops it; stores nothing. */
  probeDeclared: (request: McpServerDeclaredProbeRequest) => Promise<McpProbeResult>
}

const defaultDeps: McpInventoryRuntimeDeps = {
  preview: () => aiCliImportService.preview({}),
  listImportedItems: () => aiOrchestratorStore.listImportedItems(),
  setProfileEnabled: (itemId, profileId, enabled) =>
    aiImportedConfigRuntime.setMcpProfileEnabled(itemId, profileId, enabled),
  setItemActive: (itemId, active) => aiImportedConfigRuntime.setActive(itemId, active),
  probeDeclared: (request) =>
    probeDeclaredServer(request, {
      getScan: (scanId) => aiOrchestratorStore.getImportScan(scanId),
      runner: {
        registerProfile: (profile) => intelligenceMcpRegistry.registerProfile(profile),
        unregisterProfile: (profileId) => intelligenceMcpRegistry.unregisterProfile(profileId),
        listServerTools: (profileId) => intelligenceMcpRegistry.listStructuredTools([profileId])
      }
    })
}

/** Every server this machine's agents declare and every server Tuff holds, one row each. */
export async function getMcpServerInventory(
  deps: McpInventoryRuntimeDeps = defaultDeps
): Promise<McpServerInventory> {
  const scan = await deps.preview()
  const [discovery, items] = await Promise.all([loadMcpDiscovery(scan), deps.listImportedItems()])
  return buildMcpServerInventory({ scanId: scan.scanId, discovery, items })
}

export function registerMcpInventoryChannels(
  transport: ITuffTransportMain,
  deps: McpInventoryRuntimeDeps = defaultDeps
): () => void {
  const cleanups = [
    transport.on(McpServerEvents.inventory, async (_payload, context) => {
      assertHostOwned(context)
      return await getMcpServerInventory(deps)
    }),
    transport.on(
      McpServerEvents.setServerEnabled,
      async (payload: McpServerSetEnabledRequest, context): Promise<McpServerTuffState> => {
        assertHostOwned(context)
        return await setMcpServerEnabled(deps, payload)
      }
    ),
    transport.on(
      McpServerEvents.probeDeclared,
      async (payload: McpServerDeclaredProbeRequest, context): Promise<McpProbeResult> => {
        assertHostOwned(context)
        return await deps.probeDeclared(payload)
      }
    )
  ]
  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
