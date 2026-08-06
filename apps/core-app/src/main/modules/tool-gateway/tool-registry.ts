import type { AgentContextSource, McpRiskLevel } from './agent-context-source'
import type { PluginFeatureSource } from './plugin-feature-source'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { CHART_RESULT_PREFIX } from '@talex-touch/utils/transport/sdk/domains/agent-tools'

/**
 * How much damage a tool can do, which decides whether a session-level
 * "remember" is allowed to skip its confirmation.
 */
export type ToolRisk = 'read' | 'write' | 'execute'

export interface ToolResult {
  output: string
  isError: boolean
}

/** What the gateway needs to know about one specific call before running it. */
export interface ToolCallPlan {
  risk: ToolRisk
  summary: string
  /** Scope of a remembered approval; a tool that proxies others narrows it. */
  rememberKey: string
}

export interface ToolDefinition {
  name: string
  risk: ToolRisk
  /** One-line description shown on the confirmation card. */
  summarize: (args: Record<string, unknown>) => string
  /**
   * Per-call override for tools that proxy something else, where the static
   * risk above cannot know what is actually being invoked.
   */
  classify?: (args: Record<string, unknown>) => Promise<ToolCallPlan>
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
}

/** Only read-risk tools may be waved through by a remembered approval. */
export function isRememberable(risk: ToolRisk): boolean {
  return risk === 'read'
}

function readStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Resolves a user-supplied path to an absolute one, expanding `~`. Paths are
 * not* sandboxed to a root here: the confirmation dialog shows the resolved
 * path and the user approves that exact string, so the gate is consent rather
 * than a fixed allowlist — which would make "read the file I'm asking about"
 * impossible.
 */
export function resolveUserPath(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const expanded = trimmed.startsWith('~') ? trimmed.replace(/^~/, homedir()) : trimmed
  return isAbsolute(expanded) ? expanded : resolve(expanded)
}

/** Reading more than this into a model's context is never the intent. */
const MAX_READ_BYTES = 256 * 1024

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.icns',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.7z',
  '.dmg',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.wav',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf'
])

function looksBinary(path: string): boolean {
  const dot = path.lastIndexOf('.')
  return dot >= 0 && BINARY_EXTENSIONS.has(path.slice(dot).toLowerCase())
}

/**
 * Chart types the renderer can draw from a declarative spec. Everything here
 * maps onto ECharts with the same labels/series shape — a type that needed a
 * different data model would need its own validation, not a new set member.
 */
const CHART_TYPES = new Set([
  'bar',
  'line',
  'area',
  'pie',
  'doughnut',
  'scatter',
  'radar',
  'funnel',
  'gauge',
  'heatmap'
])
/** Enough for a readable chart; beyond this a table serves the user better. */
const MAX_CHART_POINTS = 200

export interface ChartSpec {
  type: string
  title?: string
  labels: string[]
  series: Array<{ name?: string; values: number[] }>
  /** Axis captions; ignored by types that have no axes. */
  xLabel?: string
  yLabel?: string
  /** Stacks bar/area series instead of drawing them side by side. */
  stacked?: boolean
  /** Renders values on the marks themselves. */
  showValues?: boolean
}

/**
 * Validates a model-proposed chart into a fixed shape.
 *
 * Deliberately not "run the code the model wrote": a declarative spec the
 * renderer maps onto ECharts options gives the same reports without handing
 * the model an execution surface.
 */
export function parseChartSpec(args: Record<string, unknown>): ChartSpec | string {
  const type = String(args.type ?? '')
    .trim()
    .toLowerCase()
  if (!CHART_TYPES.has(type)) {
    return `type must be one of ${[...CHART_TYPES].join(', ')}`
  }

  const labels = Array.isArray(args.labels) ? args.labels.map((label) => String(label)) : []
  if (labels.length === 0) return 'labels must be a non-empty array'
  if (labels.length > MAX_CHART_POINTS) return `labels is limited to ${MAX_CHART_POINTS} entries`

  const rawSeries = Array.isArray(args.series) ? args.series : []
  if (rawSeries.length === 0) return 'series must be a non-empty array'

  const series: ChartSpec['series'] = []
  for (const entry of rawSeries) {
    const record = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null
    const values = Array.isArray(record?.values) ? record.values : null
    if (!values) return 'each series needs a numeric values array'
    const numbers = values.map((value) =>
      typeof value === 'number' && Number.isFinite(value) ? value : 0
    )
    if (numbers.length !== labels.length) {
      return 'each series must have exactly one value per label'
    }
    series.push({
      ...(typeof record?.name === 'string' ? { name: record.name } : {}),
      values: numbers
    })
  }

  return {
    type,
    ...(typeof args.title === 'string' ? { title: args.title } : {}),
    ...(typeof args.xLabel === 'string' ? { xLabel: args.xLabel } : {}),
    ...(typeof args.yLabel === 'string' ? { yLabel: args.yLabel } : {}),
    ...(args.stacked === true ? { stacked: true } : {}),
    ...(args.showValues === true ? { showValues: true } : {}),
    labels,
    series
  }
}

/**
 * MCP servers rank their tools on a four-level scale of their own. Only a tool
 * the server itself marks read-only earns the rememberable `read` tier;
 * everything else — including anything we failed to classify — re-asks on every
 * call.
 */
export function mcpRiskToToolRisk(level: McpRiskLevel): ToolRisk {
  return level === 'low' ? 'read' : 'execute'
}

/**
 * `critical` is what the MCP registry assigns a tool carrying `destructiveHint`
 * (or one whose name reads like a delete), so the mark earns its place on the
 * confirmation card.
 */
function mcpSummary(serverName: string, toolName: string, level: McpRiskLevel): string {
  return `${level === 'critical' ? '⚠ ' : ''}${serverName} / ${toolName}`
}

/** Matches the budget the orchestrator gives imported context. */
const MAX_TOOL_TEXT_CHARS = 64 * 1024

function truncateForModel(text: string): string {
  return text.length > MAX_TOOL_TEXT_CHARS
    ? `${text.slice(0, MAX_TOOL_TEXT_CHARS)}\n… truncated at ${MAX_TOOL_TEXT_CHARS} characters.`
    : text
}

/** Table rows are split on the separators, so no field may carry one. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function stringifyMcpResult(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export interface ToolRegistryOptions {
  /** Injected so the gateway can be tested without the search subsystem. */
  searchFiles: (query: string, limit: number) => Promise<Array<{ name: string; path: string }>>
  openPath: (path: string) => Promise<string>
  /** The user's imported skills and MCP servers. */
  agentContext: AgentContextSource
  /** The features the user's installed plugins expose. */
  pluginFeatures: PluginFeatureSource
}

export function createToolRegistry(options: ToolRegistryOptions): Map<string, ToolDefinition> {
  const tools: ToolDefinition[] = [
    {
      name: 'tuff_search_files',
      risk: 'read',
      summarize: (args) => `Search files for "${readStringArg(args, 'query')}"`,
      execute: async (args) => {
        const query = readStringArg(args, 'query').trim()
        if (!query) return { output: 'query is required', isError: true }
        const limitArg = args.limit
        const limit = typeof limitArg === 'number' && limitArg > 0 ? Math.min(limitArg, 50) : 20

        const results = await options.searchFiles(query, limit)
        if (results.length === 0) return { output: 'No files matched.', isError: false }
        return {
          output: results.map((item) => `${item.name}\t${item.path}`).join('\n'),
          isError: false
        }
      }
    },
    {
      name: 'tuff_read_file',
      risk: 'read',
      summarize: (args) => `Read ${readStringArg(args, 'path')}`,
      execute: async (args) => {
        const path = resolveUserPath(readStringArg(args, 'path'))
        if (!path) return { output: 'path is required', isError: true }
        if (looksBinary(path)) return { output: 'Refusing to read a binary file.', isError: true }

        try {
          const info = await stat(path)
          if (info.isDirectory()) return { output: 'Path is a directory.', isError: true }
          if (info.size > MAX_READ_BYTES) {
            return {
              output: `File is ${Math.round(info.size / 1024)}KB, over the ${MAX_READ_BYTES / 1024}KB read limit.`,
              isError: true
            }
          }
          return { output: await readFile(path, 'utf8'), isError: false }
        } catch (error) {
          return { output: `Could not read file: ${(error as Error).message}`, isError: true }
        }
      }
    },
    {
      name: 'tuff_open_path',
      risk: 'execute',
      summarize: (args) => `Open ${readStringArg(args, 'path')} in the system default app`,
      execute: async (args) => {
        const path = resolveUserPath(readStringArg(args, 'path'))
        if (!path) return { output: 'path is required', isError: true }
        const failure = await options.openPath(path)
        return failure
          ? { output: `Could not open: ${failure}`, isError: true }
          : { output: `Opened ${path}`, isError: false }
      }
    },
    {
      name: 'tuff_render_chart',
      // No confirmation worth asking for: this only draws data the model
      // already has in the conversation, and touches nothing on the machine.
      risk: 'read',
      summarize: (args) => `Render a ${String(args.type ?? 'chart')} chart`,
      execute: async (args) => {
        const spec = parseChartSpec(args)
        if (typeof spec === 'string') return { output: `Invalid chart: ${spec}`, isError: true }
        // The payload rides the normal tool-result channel with a marker the
        // renderer recognises, so no second transport is needed for widgets.
        return { output: `${CHART_RESULT_PREFIX}${JSON.stringify(spec)}`, isError: false }
      }
    },
    {
      name: 'tuff_skill_read',
      risk: 'read',
      summarize: (args) => `Read imported skill ${readStringArg(args, 'id')}`,
      execute: async (args) => {
        const id = readStringArg(args, 'id').trim()
        if (!id) return { output: 'id is required', isError: true }
        try {
          return {
            output: truncateForModel(await options.agentContext.readSkill(id)),
            isError: false
          }
        } catch (error) {
          return { output: (error as Error).message, isError: true }
        }
      }
    },
    {
      name: 'tuff_mcp_list_tools',
      risk: 'read',
      summarize: () => 'List the tools on the enabled MCP servers',
      execute: async () => {
        const servers = await options.agentContext.listMcpServers()
        if (servers.length === 0) {
          // A prompt, not an error: nothing is broken, the user simply has no
          // server configured yet.
          return {
            output: 'No MCP servers are enabled. The user can add one in Settings, Skills & MCP.',
            isError: false
          }
        }

        const lines = ['server\ttool\tconfirmation\tdescription']
        for (const server of servers) {
          try {
            const tools = await options.agentContext.listMcpTools(server.id)
            if (tools.length === 0) {
              lines.push(`${server.id}\t(no tools)`)
              continue
            }
            for (const tool of tools) {
              lines.push(
                `${server.id}\t${tool.name}\t${mcpRiskToToolRisk(tool.risk)}\t${tool.description}`
              )
            }
          } catch (error) {
            // One unreachable server must not hide the rest of the catalogue.
            lines.push(`${server.id}\tunavailable: ${(error as Error).message}`)
          }
        }
        return { output: lines.join('\n'), isError: false }
      }
    },
    {
      name: 'tuff_mcp_call',
      // Stands in only if `classify` cannot reach the server: the real risk
      // belongs to the MCP tool being proxied, not to this forwarder.
      risk: 'execute',
      summarize: (args) => `${readStringArg(args, 'server')} / ${readStringArg(args, 'tool')}`,
      classify: async (args) => {
        const server = readStringArg(args, 'server').trim()
        const tool = readStringArg(args, 'tool').trim()
        // Keyed by the proxied tool rather than by `tuff_mcp_call`, so a
        // remembered yes for one read-only tool never waves through another
        // server's destructive one.
        const fallback: ToolCallPlan = {
          risk: 'execute',
          summary: `${server} / ${tool}`,
          rememberKey: `tuff_mcp_call:${server}/${tool}`
        }
        try {
          const entry = (await options.agentContext.listMcpTools(server)).find(
            (candidate) => candidate.name === tool
          )
          if (!entry) return fallback
          return {
            risk: mcpRiskToToolRisk(entry.risk),
            summary: mcpSummary(entry.serverName, entry.name, entry.risk),
            rememberKey: fallback.rememberKey
          }
        } catch {
          // A server that cannot be reached cannot vouch for its tool: ask.
          return fallback
        }
      },
      execute: async (args) => {
        const server = readStringArg(args, 'server').trim()
        const tool = readStringArg(args, 'tool').trim()
        if (!server || !tool) return { output: 'server and tool are required', isError: true }
        const callArgs =
          args.args && typeof args.args === 'object' ? (args.args as Record<string, unknown>) : {}

        try {
          const result = await options.agentContext.callMcpTool(server, tool, callArgs)
          return { output: truncateForModel(stringifyMcpResult(result)), isError: false }
        } catch (error) {
          return { output: `MCP call failed: ${(error as Error).message}`, isError: true }
        }
      }
    },
    {
      name: 'tuff_list_features',
      risk: 'read',
      summarize: () => 'List the features the installed plugins expose',
      execute: async () => {
        const entries = options.pluginFeatures.listFeatures()
        if (entries.length === 0) {
          // Same reading as an empty MCP catalogue: nothing failed, the user
          // simply has no plugin offering a feature right now.
          return {
            output:
              'No plugin features are available. The user can install or enable plugins in Settings, Plugins & Tools.',
            isError: false
          }
        }

        const lines = ['plugin\tfeature\ttitle\topens_ui\tdescription']
        for (const entry of entries) {
          lines.push(
            [
              entry.pluginName,
              entry.featureId,
              oneLine(`${entry.pluginLabel} / ${entry.featureName}`),
              entry.opensUi ? 'yes' : 'no',
              oneLine(entry.description)
            ].join('\t')
          )
        }
        return { output: truncateForModel(lines.join('\n')), isError: false }
      }
    },
    {
      name: 'tuff_invoke_feature',
      // Runs a third party's code on the user's machine, so it re-asks every
      // time however harmless the feature's own description reads.
      risk: 'execute',
      summarize: (args) => {
        const pluginName = readStringArg(args, 'plugin').trim()
        const featureId = readStringArg(args, 'feature').trim()
        const entry = options.pluginFeatures.findFeature(pluginName, featureId)
        // Falls back to the raw ids when the pair no longer resolves: the card
        // still names what was asked for, and `execute` reports the miss.
        return entry
          ? `${entry.pluginLabel} / ${entry.featureName}`
          : `${pluginName} / ${featureId}`
      },
      execute: async (args) => {
        const pluginName = readStringArg(args, 'plugin').trim()
        const featureId = readStringArg(args, 'feature').trim()
        if (!pluginName || !featureId) {
          return { output: 'plugin and feature are required', isError: true }
        }

        const entry = options.pluginFeatures.findFeature(pluginName, featureId)
        if (!entry) {
          return {
            output: `No enabled plugin feature "${pluginName}" / "${featureId}". Call tuff_list_features for the current catalogue.`,
            isError: true
          }
        }

        const title = `${entry.pluginLabel} / ${entry.featureName}`
        try {
          const { handled } = await options.pluginFeatures.invokeFeature(
            pluginName,
            featureId,
            readStringArg(args, 'text')
          )
          if (!handled) return { output: `${title} declined the request.`, isError: true }
          return {
            output: entry.opensUi
              ? `Triggered ${title}. It opened its own window, so its result is on the user's screen rather than here.`
              : `Triggered ${title}.`,
            isError: false
          }
        } catch (error) {
          return { output: `Feature invocation failed: ${(error as Error).message}`, isError: true }
        }
      }
    }
  ]

  return new Map(tools.map((tool) => [tool.name, tool]))
}
