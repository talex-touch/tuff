/**
 * What Tuff offers to a connected agent, and how each offer reaches the tool
 * that actually does the work.
 *
 * The list is hand-written rather than derived from the registry. An external
 * client is not the home conversation: it has no Tuff UI to draw into, and its
 * model has never seen this product. Three consequences, all deliberate:
 *
 * - `tuff_render_chart` / `tuff_render_form` / `tuff_render_widget` are absent.
 *   Their whole result is something on the user's screen, so a client that only
 *   reads text would call them and appear to hang.
 * - `tuff_mcp_list_tools` / `tuff_mcp_call` are absent: they proxy Tuff's own
 *   client-side MCP servers, and a connected agent already brings its own.
 * - Descriptions and input schemas are written for the wire. `summarize()` in
 *   the registry is phrased for the confirmation card the user reads; it is not
 *   an argument contract.
 */

import type { ToolDefinition, ToolResult } from '../tool-gateway/tool-registry'
import type { LocalSkillEntry } from '../ai/skill-local-sources'
import { listEnabledLocalSkills } from '../ai/skill-local-sources'
import { truncateForModel } from '../tool-gateway/tool-registry'

/** Mirrors the gateway's `ToolRisk`, so a card reads the same wherever it came from. */
export type McpHostRisk = 'read' | 'write' | 'execute'

export interface McpHostToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  risk: McpHostRisk
  /**
   * Whether a fresh install offers it. Anything that writes, opens or runs
   * starts off: the user turns those on deliberately, one at a time.
   */
  defaultEnabled: boolean
  /**
   * Set when the tool is implemented here rather than in the shared registry.
   * The registry stays the one home conversation's surface; a tool that only
   * makes sense over the wire lives beside the wire.
   */
  hostOwned?: boolean
}

const pathProperty = { type: 'string', description: 'Absolute path, or one starting with ~' }

export const MCP_HOST_TOOL_SPECS: readonly McpHostToolSpec[] = [
  {
    name: 'tuff_search_files',
    description:
      "Search this machine's file index — the same index Tuff's launcher searches, so results match what the user sees there. Returns one tab-separated `name<TAB>path` row per hit.",
    risk: 'read',
    defaultEnabled: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for' },
        limit: { type: 'number', description: 'Maximum hits to return (1-50, default 20)' }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'tuff_read_file',
    description:
      'Read one text file from this machine by absolute path. Refuses directories, binary files, and anything over 256 KiB.',
    risk: 'read',
    defaultEnabled: true,
    inputSchema: {
      type: 'object',
      properties: { path: pathProperty },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'tuff_write_file',
    description:
      'Create a new text file. Never overwrites: an existing path is refused, so pick a fresh name instead of retrying. Maximum 1 MiB.',
    risk: 'write',
    defaultEnabled: false,
    inputSchema: {
      type: 'object',
      properties: {
        path: pathProperty,
        content: { type: 'string', description: 'Full file contents' }
      },
      required: ['path', 'content'],
      additionalProperties: false
    }
  },
  {
    name: 'tuff_open_path',
    description:
      "Open a file or folder in the system default application. This is visible on the user's screen the moment it runs.",
    risk: 'execute',
    defaultEnabled: false,
    inputSchema: {
      type: 'object',
      properties: { path: pathProperty },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'tuff_list_features',
    description:
      'List the features the installed Tuff plugins expose. Returns one tab-separated row per feature, including the `plugin` and `feature` ids `tuff_invoke_feature` expects.',
    risk: 'read',
    defaultEnabled: true,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'tuff_invoke_feature',
    description:
      "Run a feature exposed by an installed Tuff plugin, by plugin name and feature id as listed by tuff_list_features. Runs third-party code on the user's machine.",
    risk: 'execute',
    defaultEnabled: false,
    inputSchema: {
      type: 'object',
      properties: {
        plugin: { type: 'string', description: 'Plugin name from tuff_list_features' },
        feature: { type: 'string', description: 'Feature id from tuff_list_features' },
        text: { type: 'string', description: 'Optional text argument for the feature' }
      },
      required: ['plugin', 'feature'],
      additionalProperties: false
    }
  },
  {
    name: 'tuff_list_skills',
    description:
      "List the skills Tuff can read on this machine, with the ids tuff_skill_read expects. Covers both the user's linked skill directories and configurations imported from other agent tools.",
    risk: 'read',
    defaultEnabled: true,
    hostOwned: true,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'tuff_skill_read',
    description:
      'Read one skill by id, as listed by tuff_list_skills. Ids only — a path is refused, and a skill the user has switched off is unreadable rather than merely unlisted.',
    risk: 'read',
    defaultEnabled: true,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Skill id from tuff_list_skills' } },
      required: ['id'],
      additionalProperties: false
    }
  }
]

/** An imported skill row, reduced to what the listing needs. */
export interface McpHostImportedSkill {
  id: string
  name: string
  description: string
}

export interface McpHostToolsetDeps {
  /** The shared registry — the same tools the home conversation can call. */
  registry: Map<string, ToolDefinition>
  listImportedSkills: () => Promise<McpHostImportedSkill[]>
}

export interface McpHostToolset {
  /** Every visible tool, in listing order. */
  specs: readonly McpHostToolSpec[]
  /** Resolves a visible tool to its definition, or null when it is not exposed. */
  resolve: (name: string) => ToolDefinition | null
}

function hostOwnedFailure(message: string): ToolResult {
  return { output: message, isError: true }
}

function describeLocalSkill(skill: LocalSkillEntry): string {
  const description = skill.description.trim()
  const suffix = description ? `\t${description}` : ''
  return `${skill.id}\t${skill.name}${suffix}`
}

function buildListSkillsTool(deps: McpHostToolsetDeps): ToolDefinition {
  return {
    name: 'tuff_list_skills',
    risk: 'read',
    summarize: () => 'List the skills Tuff can read',
    execute: async () => {
      const lines = ['id\tsource\tname\tdescription']
      try {
        for (const skill of await listEnabledLocalSkills()) {
          lines.push(`${describeLocalSkill(skill)}\tlinked`)
        }
      } catch (error) {
        // A broken linked directory must not hide the imported half of the list.
        lines.push(
          `linked\t\tunavailable: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      try {
        for (const skill of await deps.listImportedSkills()) {
          const description = skill.description.trim()
          lines.push(`${skill.id}\timported\t${skill.name}\t${description}`)
        }
      } catch (error) {
        lines.push(
          `imported\t\tunavailable: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      if (lines.length === 1) {
        return {
          output:
            'No skills are available yet. The user can link a skill directory or import one in Settings, Skills & MCP.',
          isError: false
        }
      }

      return { output: truncateForModel(lines.join('\n')), isError: false }
    }
  }
}

/**
 * Binds the exposed specs to real implementations. A spec with no registry
 * entry and no host implementation is dropped rather than listed: advertising a
 * tool that always fails is worse than not offering it.
 */
export function createMcpHostToolset(deps: McpHostToolsetDeps): McpHostToolset {
  const hostOwned = new Map<string, ToolDefinition>([
    ['tuff_list_skills', buildListSkillsTool(deps)]
  ])

  const available = MCP_HOST_TOOL_SPECS.filter((spec) =>
    spec.hostOwned ? hostOwned.has(spec.name) : deps.registry.has(spec.name)
  )

  const byName = new Map<string, ToolDefinition>()
  for (const spec of available) {
    const definition = spec.hostOwned ? hostOwned.get(spec.name) : deps.registry.get(spec.name)
    if (definition) byName.set(spec.name, definition)
  }

  return {
    specs: available,
    resolve: (name) => byName.get(name) ?? null
  }
}

export { hostOwnedFailure }
