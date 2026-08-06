/**
 * Reads the user's imported skills and MCP servers on behalf of the agent tools.
 *
 * The orchestrator island reaches the same data through
 * `ai-imported-config-runtime`, which gates every lookup on the active
 * workspace. A home conversation has no workspace, so availability here is
 * simply "the user activated the item" — the workspace clause is dropped rather
 * than faked with a stand-in cwd, which would silently hide workspace-scoped
 * servers the settings page happily lists.
 *
 * Everything comes in as a dependency so the lookups stay testable without the
 * AI subsystem, its database, or Electron.
 */

import type { AdaptedStructuredTool } from '@talex-touch/tuff-intelligence'
import type { AiImportedConfigItem } from '@talex-touch/utils/types/ai-orchestrator'
import type { IntelligenceMcpProfile } from '../ai/intelligence-mcp-registry'
import { LOCAL_SKILL_ID_PREFIX } from '../ai/skill-local-sources'

/** The MCP-side risk scale, as `intelligence-mcp-registry` resolves it. */
export type McpRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface McpServerEntry {
  id: string
  name: string
}

export interface McpToolEntry {
  serverId: string
  serverName: string
  /** The server's own tool name — what `callMcpTool` expects. */
  name: string
  description: string
  risk: McpRiskLevel
}

export interface AgentContextSource {
  /**
   * Rejects anything that is not an active imported skill with managed content,
   * or — for a `local:` id — a skill under a directory the user registered.
   */
  readSkill: (skillId: string) => Promise<string>
  listMcpServers: () => Promise<McpServerEntry[]>
  listMcpTools: (serverId: string) => Promise<McpToolEntry[]>
  callMcpTool: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<unknown>
}

export interface AgentContextDeps {
  listImportedItems: () => Promise<AiImportedConfigItem[]>
  readContent: (contentRef: string) => Promise<string>
  /**
   * Reads a skill linked from a registered local directory. It enforces its own
   * boundary — the id has to resolve to a directory still in the registry, and
   * the file has to stay inside it.
   */
  readLocalSkill: (skillId: string) => Promise<string>
  registerMcpProfile: (profile: IntelligenceMcpProfile) => void
  listStructuredTools: (profileIds: string[]) => Promise<AdaptedStructuredTool[]>
  callMcpTool: (profileId: string, toolName: string, input: unknown) => Promise<unknown>
}

function isActive(item: AiImportedConfigItem): boolean {
  return item.active && item.state === 'active'
}

/**
 * Twin of the private reader in `ai-imported-config-runtime`; both project the
 * same imported-item field, and both must accept whatever the importer wrote.
 */
function mcpProfilesFromItem(item: AiImportedConfigItem): IntelligenceMcpProfile[] {
  const profiles = item.normalizedProjection?.mcpProfiles
  return Array.isArray(profiles)
    ? profiles.filter((profile): profile is IntelligenceMcpProfile =>
        Boolean(profile && typeof profile === 'object' && 'id' in profile && 'transport' in profile)
      )
    : []
}

const RISK_LEVELS = new Set<string>(['low', 'medium', 'high', 'critical'])

function riskOf(tool: AdaptedStructuredTool): McpRiskLevel {
  const level = tool.tuffMetadata?.riskLevel
  // A tool we could not classify is never treated as the safe tier.
  return RISK_LEVELS.has(level as string) ? (level as McpRiskLevel) : 'high'
}

function toolNameOf(tool: AdaptedStructuredTool, profileId: string): string {
  const metadata = tool.tuffMetadata?.metadata as { toolName?: unknown } | undefined
  if (typeof metadata?.toolName === 'string' && metadata.toolName) return metadata.toolName
  // Fall back to the composite id the registry builds: `mcp.<profile>.<tool>`.
  const prefix = `mcp.${profileId}.`
  return tool.name.startsWith(prefix) ? tool.name.slice(prefix.length) : tool.name
}

export function createAgentContextSource(deps: AgentContextDeps): AgentContextSource {
  const activeMcpProfiles = async (): Promise<Map<string, IntelligenceMcpProfile>> => {
    const profiles = new Map<string, IntelligenceMcpProfile>()
    for (const item of await deps.listImportedItems()) {
      if (item.kind !== 'mcp' || !isActive(item)) continue
      for (const profile of mcpProfilesFromItem(item)) {
        if (profile.enabled === false || profiles.has(profile.id)) continue
        profiles.set(profile.id, profile)
      }
    }
    return profiles
  }

  const resolveMcpProfile = async (serverId: string): Promise<IntelligenceMcpProfile> => {
    const profile = (await activeMcpProfiles()).get(serverId)
    if (!profile) throw new Error(`MCP server "${serverId}" is not enabled`)
    // Registering an unchanged definition is a no-op, so re-asserting it per
    // call costs nothing and heals a profile the orchestrator's own reconcile
    // pass dropped between turns.
    deps.registerMcpProfile(profile)
    return profile
  }

  return {
    readSkill: async (skillId) => {
      const id = skillId.trim()
      // A linked skill has no imported item behind it; its body is the file on
      // disk, resolved by the same id-only rule the local registry enforces.
      if (id.startsWith(LOCAL_SKILL_ID_PREFIX)) return await deps.readLocalSkill(id)

      const item = (await deps.listImportedItems()).find((candidate) => candidate.id === id)
      // The caller names a skill by id and nothing else: the file path comes
      // from the item the user imported, so no path the model invents is
      // reachable through here.
      if (!item || item.kind !== 'skill' || !isActive(item)) {
        throw new Error(`Skill "${skillId}" is not an active imported skill`)
      }
      if (!item.contentRef) throw new Error(`Skill "${skillId}" has no managed content`)
      return await deps.readContent(item.contentRef)
    },

    listMcpServers: async () =>
      [...(await activeMcpProfiles()).values()].map((profile) => ({
        id: profile.id,
        name: profile.name
      })),

    listMcpTools: async (serverId) => {
      const profile = await resolveMcpProfile(serverId)
      const tools = await deps.listStructuredTools([profile.id])
      return tools.map((tool) => ({
        serverId: profile.id,
        serverName: profile.name,
        name: toolNameOf(tool, profile.id),
        description: tool.description ?? '',
        risk: riskOf(tool)
      }))
    },

    callMcpTool: async (serverId, toolName, args) => {
      const profile = await resolveMcpProfile(serverId)
      return await deps.callMcpTool(profile.id, toolName, args)
    }
  }
}
