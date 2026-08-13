/**
 * Tuff tools for the `pi` agent.
 *
 * Every tool here is a forwarder to the desktop app's loopback gateway — the
 * work happens in the app's main process, behind its confirmation gate, so the
 * agent process never holds the capability itself. Absent the gateway
 * environment (a plain `pi` run outside Tuff) nothing is registered at all.
 */

import process from 'node:process'

interface ToolResultBlock {
  content: Array<{ type: 'text', text: string }>
  isError?: boolean
}

interface ToolSpec {
  name: string
  label: string
  description: string
  promptSnippet: string
  parameters: unknown
  /**
   * pi's own executor signature — verified against a live run: the tool call
   * id comes first and the model's arguments second. Assuming `(args)` here
   * silently hands the id to the tool as its parameters.
   */
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
  ) => Promise<ToolResultBlock>
}

interface ExtensionApi {
  registerTool: (tool: ToolSpec) => unknown
}

const GATEWAY_URL = process.env.TUFF_TOOL_GATEWAY_URL?.trim()
const GATEWAY_TOKEN = process.env.TUFF_TOOL_GATEWAY_TOKEN?.trim()

/** A hung app must not hang the agent turn behind it. */
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000

function text(body: string, isError = false): ToolResultBlock {
  return { content: [{ type: 'text', text: body }], isError }
}

async function callGateway(
  tool: string,
  callId: string,
  args: Record<string, unknown>,
): Promise<ToolResultBlock> {
  if (!GATEWAY_URL || !GATEWAY_TOKEN)
    return text('Tuff tool gateway is not available.', true)

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS)

  try {
    // pi agent process, not the app: the network SDK it would otherwise use is
    // not loadable there, and the only reachable endpoint is our own loopback.
    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ tool, callId, args }),
      signal: abort.signal,
    })

    if (!response.ok)
      return text(`Tuff gateway returned ${response.status}.`, true)

    const result = (await response.json()) as { output?: string, isError?: boolean }
    return text(result.output ?? '', result.isError === true)
  }
  catch (error) {
    const reason = (error as Error).name === 'AbortError' ? 'timed out' : (error as Error).message
    return text(`Tuff gateway call failed: ${reason}`, true)
  }
  finally {
    clearTimeout(timer)
  }
}

const TOOLS: Array<Omit<ToolSpec, 'execute'>> = [
  {
    name: 'tuff_search_files',
    label: 'Tuff: search files',
    description:
      'Search the user\'s indexed files by name or content. Returns matching file names and absolute paths.',
    promptSnippet: 'Search the user\'s files through Tuff',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for' },
        limit: { type: 'number', description: 'Maximum results (default 20, max 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'tuff_read_file',
    label: 'Tuff: read file',
    description:
      'Read a UTF-8 text file from the user\'s machine. Binary files and files over 256KB are refused.',
    promptSnippet: 'Read a text file through Tuff',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path, or one starting with ~' },
      },
      required: ['path'],
    },
  },
  {
    name: 'tuff_write_file',
    label: 'Tuff: write file',
    description:
      'Create a new UTF-8 text file on the user\'s machine (e.g. a Markdown note on the Desktop). '
      + 'Never overwrites: an existing path is refused, so pick a fresh name. The parent directory '
      + 'must already exist. Content is capped at 1MB.',
    promptSnippet: 'Create a text file through Tuff',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path, or one starting with ~ (e.g. ~/Desktop/note.md)',
        },
        content: { type: 'string', description: 'UTF-8 text content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'tuff_render_chart',
    label: 'Tuff: render chart',
    description:
      'Draw a chart in the conversation from data you already have. Use this instead of describing '
      + 'a chart in text when the user asks for a report, breakdown or visualisation.',
    promptSnippet: 'Render a chart from data',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            'bar | line | area | pie | doughnut | scatter | radar | funnel | gauge | heatmap',
        },
        title: { type: 'string', description: 'Chart title' },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Category labels, one per data point',
        },
        xLabel: { type: 'string', description: 'X axis caption' },
        yLabel: { type: 'string', description: 'Y axis caption' },
        stacked: { type: 'boolean', description: 'Stack bar/area series instead of grouping them' },
        showValues: { type: 'boolean', description: 'Print values on the marks' },
        series: {
          type: 'array',
          description: 'One entry per series; each values array matches labels in length',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              values: { type: 'array', items: { type: 'number' } },
            },
            required: ['values'],
          },
        },
      },
      required: ['type', 'labels', 'series'],
    },
  },
  {
    name: 'tuff_render_form',
    label: 'Tuff: render form',
    description:
      'Show an interactive form in the conversation to collect structured input. Use this instead '
      + 'of asking for several values in prose. The form appears as soon as this call returns, but '
      + 'the answers arrive later as the user\'s own next message — never assume what was filled '
      + 'in, and do not re-render the same form while waiting.',
    promptSnippet: 'Collect structured input with a form',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Form title' },
        description: { type: 'string', description: 'One line on what the form is for' },
        submitLabel: { type: 'string', description: 'Label for the submit button' },
        fields: {
          type: 'array',
          description: 'Up to 20 fields; every key must be unique',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Identifier the answer comes back under' },
              label: { type: 'string', description: 'Caption shown above the field' },
              type: {
                type: 'string',
                description: 'text | textarea | number | select | checkbox',
              },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'Choices; required for select, ignored otherwise',
              },
              required: { type: 'boolean', description: 'Blocks submission while empty' },
              placeholder: { type: 'string', description: 'Hint shown in the empty field' },
              default: { description: 'Pre-filled value, matching the field type' },
            },
            required: ['key', 'label', 'type'],
          },
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'tuff_open_path',
    label: 'Tuff: open path',
    description:
      'Open a file or folder in the system default application. Always asks the user first.',
    promptSnippet: 'Open a file or folder for the user',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path, or one starting with ~' },
      },
      required: ['path'],
    },
  },
  {
    name: 'tuff_skill_read',
    label: 'Tuff: read skill',
    description:
      'Read the full text of one of the user\'s imported skills. Your context lists the available '
      + 'skills by id and description; pass one of those ids. This reads managed skill content '
      + 'only — it is not a file reader.',
    promptSnippet: 'Read an imported skill by id before following it',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Skill id, exactly as listed in your context' },
      },
      required: ['id'],
    },
  },
  {
    name: 'tuff_mcp_list_tools',
    label: 'Tuff: list MCP tools',
    description:
      'List the tools exposed by the MCP servers the user has enabled, as tab-separated '
      + 'server / tool / confirmation / description rows. Call this before tuff_mcp_call: the '
      + 'catalogue changes whenever the user edits their servers, so never assume a tool exists.',
    promptSnippet: 'Discover the user\'s MCP tools before calling one',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'tuff_mcp_call',
    label: 'Tuff: call MCP tool',
    description:
      'Invoke one tool on one of the user\'s MCP servers. Use the exact server and tool values '
      + 'from tuff_mcp_list_tools, and arguments matching that tool\'s schema. Anything the '
      + 'server does not mark read-only asks the user every single time.',
    promptSnippet: 'Call an MCP tool discovered through tuff_mcp_list_tools',
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'Server id from tuff_mcp_list_tools' },
        tool: { type: 'string', description: 'Tool name from tuff_mcp_list_tools' },
        args: { type: 'object', description: 'Arguments for the tool, per its own schema' },
      },
      required: ['server', 'tool'],
    },
  },
  {
    name: 'tuff_list_features',
    label: 'Tuff: list plugin features',
    description:
      'List the features the user\'s installed Tuff plugins expose, as tab-separated '
      + 'plugin / feature / title / opens_ui / description rows. Call this before '
      + 'tuff_invoke_feature: the catalogue changes whenever the user installs, enables or '
      + 'reloads a plugin, so never assume a feature exists.',
    promptSnippet: 'Discover the user\'s plugin features before invoking one',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'tuff_invoke_feature',
    label: 'Tuff: invoke plugin feature',
    description:
      'Trigger one feature of one installed plugin, exactly as the user would by typing it into '
      + 'the launcher. Use the exact plugin and feature values from tuff_list_features. This runs '
      + 'the plugin\'s own code and asks the user every single time; a feature with opens_ui=yes '
      + 'shows its result in its own window rather than returning it to you.',
    promptSnippet: 'Invoke a plugin feature discovered through tuff_list_features',
    parameters: {
      type: 'object',
      properties: {
        plugin: { type: 'string', description: 'Plugin id from tuff_list_features' },
        feature: { type: 'string', description: 'Feature id from tuff_list_features' },
        text: {
          type: 'string',
          description: 'Text to hand the feature, as the user would have typed after the keyword',
        },
      },
      required: ['plugin', 'feature'],
    },
  },
]

export default function tuffTools(pi: ExtensionApi): void {
  if (!GATEWAY_URL || !GATEWAY_TOKEN)
    return

  for (const spec of TOOLS) {
    pi.registerTool({
      ...spec,
      execute: (toolCallId, params) => callGateway(spec.name, toolCallId, params ?? {}),
    })
  }
}
