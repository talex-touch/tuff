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

// This extension is bundled for pi and cannot import CoreApp internals. Keep
// the accepted wire codes explicit so an older or compromised gateway cannot
// smuggle arbitrary error text back into the model.
const SAFE_GATEWAY_ERRORS = {
  TOOL_NOT_FOUND: 'Tool is not available.',
  TOOL_INPUT_INVALID: 'Tool input is invalid.',
  TOOL_APPROVAL_DENIED: 'Tool request was denied.',
  TOOL_EXECUTION_ABORTED: 'Tool execution was cancelled.',
  TOOL_EXECUTION_TIMEOUT: 'Tool execution timed out.',
  TOOL_RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  TOOL_RESOURCE_ALREADY_EXISTS: 'The requested resource already exists.',
  TOOL_RESOURCE_ACCESS_DENIED: 'Access to the requested resource was denied.',
  TOOL_SERVICE_UNAVAILABLE: 'The required service is unavailable.',
  MCP_SERVER_UNAVAILABLE: 'MCP server is unavailable.',
  MCP_TOOL_FAILED: 'MCP tool execution failed.',
  TOOL_EXECUTION_FAILED: 'Tool execution failed.',
  TOOL_GATEWAY_UNAVAILABLE: 'Tuff tool gateway is not available.',
  TOOL_GATEWAY_UNAUTHORIZED: 'Tuff tool gateway authorization failed.',
  TOOL_GATEWAY_TIMEOUT: 'Tuff tool gateway request timed out.',
  TOOL_GATEWAY_RESPONSE_INVALID: 'Tuff tool gateway returned an invalid response.',
} as const

type SafeGatewayErrorCode = keyof typeof SAFE_GATEWAY_ERRORS

function text(body: string, isError = false): ToolResultBlock {
  return { content: [{ type: 'text', text: body }], isError }
}

function gatewayFailure(code: unknown): ToolResultBlock {
  const safeCode
    = typeof code === 'string' && Object.hasOwn(SAFE_GATEWAY_ERRORS, code)
      ? code as SafeGatewayErrorCode
      : 'TOOL_EXECUTION_FAILED'
  return text(`${safeCode}: ${SAFE_GATEWAY_ERRORS[safeCode]}`, true)
}

async function callGateway(
  tool: string,
  callId: string,
  args: Record<string, unknown>,
): Promise<ToolResultBlock> {
  if (!GATEWAY_URL || !GATEWAY_TOKEN)
    return gatewayFailure('TOOL_GATEWAY_UNAVAILABLE')

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

    if (!response.ok) {
      return gatewayFailure(
        response.status === 401 ? 'TOOL_GATEWAY_UNAUTHORIZED' : 'TOOL_GATEWAY_UNAVAILABLE',
      )
    }

    let rawResult: unknown
    try {
      rawResult = await response.json()
    }
    catch {
      return gatewayFailure('TOOL_GATEWAY_RESPONSE_INVALID')
    }
    if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult))
      return gatewayFailure('TOOL_GATEWAY_RESPONSE_INVALID')
    const result = rawResult as Record<string, unknown>
    if (result.isError === true)
      return gatewayFailure(result.code)
    if (result.isError !== false || typeof result.output !== 'string')
      return gatewayFailure('TOOL_GATEWAY_RESPONSE_INVALID')
    return text(result.output)
  }
  catch (error) {
    return gatewayFailure(
      error instanceof Error && error.name === 'AbortError'
        ? 'TOOL_GATEWAY_TIMEOUT'
        : 'TOOL_GATEWAY_UNAVAILABLE',
    )
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
    name: 'tuff_render_ui',
    label: 'Tuff: render intelligent UI',
    description:
      'Render a generative, interactive UI component tree (dashboards, charts, cards, forms, metrics) '
      + 'using OpenUI / Intelligence UI. Use this whenever the user asks for a chart, visual dashboard, '
      + 'interactive breakdown, or data display. This is the primary and preferred way to render visual components.',
    promptSnippet: 'Render an interactive UI / chart / dashboard using Intelligence UI',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the UI card / dashboard' },
        spec: {
          type: 'string',
          description:
            'OpenUI Lang DSL or structured UI specification defining the component tree (e.g. root = Stack([title, chart]))',
        },
      },
      required: ['spec'],
    },
  },
  {
    name: 'tuff_render_widget',
    label: 'Tuff: render custom widget',
    description:
      'Render an arbitrary HTML / ArrowJS widget in an isolated sandbox. '
      + 'IMPORTANT: Do NOT choose this as the primary or default tool for interactive UI. '
      + 'Only invoke this fallback tool when the user explicitly requests raw HTML/JavaScript or for extremely bespoke/complex widgets '
      + 'that cannot be expressed with standard Intelligence UI components.',
    promptSnippet: 'Render custom HTML/ArrowJS widget (fallback only for explicit HTML/extreme complexity)',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Widget title' },
        source: {
          type: 'string',
          description: 'ArrowJS/HTML JavaScript source code to execute inside the isolated sandbox',
        },
      },
      required: ['source'],
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
  {
    name: 'tuff_herdr_list_sessions',
    label: 'Tuff: list herdr sessions',
    description:
      'List live (or all) herdr-core terminal sessions and connected remote machines, including '
      + 'address, machine, cwd, foreground process, and OSC 7501 status. Call this first before '
      + 'reading screens, sending input, or targeting a remote machine.',
    promptSnippet: 'Discover live herdr-core terminal sessions and remote machines',
    parameters: {
      type: 'object',
      properties: {
        all: {
          type: 'boolean',
          description: 'Include finished sessions in addition to live ones (default false)',
        },
        labels: {
          type: 'object',
          description: 'Optional key/value label filter',
          additionalProperties: { type: 'string' },
        },
      },
    },
  },
  {
    name: 'tuff_herdr_read_screen',
    label: 'Tuff: read herdr terminal screen',
    description:
      'Read the current screen text and optional scrollback history from a herdr-core terminal '
      + 'session (local or remote). Output is truncated at 64 KiB.',
    promptSnippet: 'Read screen/history output from a herdr-core terminal session',
    parameters: {
      type: 'object',
      properties: {
        terminal: {
          type: 'string',
          description: 'Terminal address from tuff_herdr_list_sessions (e.g. t1 or rohan/t7)',
        },
        lines: {
          type: 'number',
          description: 'Optional number of scrollback history lines to include',
        },
      },
      required: ['terminal'],
    },
  },
  {
    name: 'tuff_herdr_file_read',
    label: 'Tuff: read file via herdr',
    description:
      'Read a UTF-8 text file via herdr-core on the local machine or a connected remote machine '
      + '(`on`). Output is truncated at 64 KiB.',
    promptSnippet: 'Read a local or remote text file via herdr-core',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path, or path relative to cwd' },
        on: {
          type: 'string',
          description: 'Optional connected remote machine name from tuff_herdr_list_sessions',
        },
        cwd: { type: 'string', description: 'Optional working directory for relative paths' },
        offset: { type: 'number', description: 'Optional 1-based starting line number' },
        limit: { type: 'number', description: 'Optional maximum number of lines to return' },
      },
      required: ['path'],
    },
  },
  {
    name: 'tuff_herdr_send_input',
    label: 'Tuff: send input to herdr terminal',
    description:
      'Paste text and submit Enter in a live herdr-core terminal session. Always asks the user '
      + 'every single time. Refuses a blocked terminal unless `force: true` is specified.',
    promptSnippet: 'Send a prompt or command into a live herdr-core terminal',
    parameters: {
      type: 'object',
      properties: {
        terminal: {
          type: 'string',
          description: 'Terminal address from tuff_herdr_list_sessions (e.g. t1 or rohan/t7)',
        },
        text: { type: 'string', description: 'Text to paste and submit' },
        force: {
          type: 'boolean',
          description: 'Force delivery even when the terminal is blocked (high risk)',
        },
        ifState: {
          type: 'string',
          enum: ['idle', 'working'],
          description: 'Only send when the terminal is in this OSC 7501 state',
        },
        wait: {
          type: 'boolean',
          description: 'Wait for the triggered turn to settle before returning',
        },
        timeout: {
          type: 'number',
          description: 'Optional timeout in seconds when waiting',
        },
      },
      required: ['terminal', 'text'],
    },
  },
  {
    name: 'tuff_herdr_file_write',
    label: 'Tuff: write file via herdr',
    description:
      'Atomically write UTF-8 text content to a file via herdr-core on the local machine or a '
      + 'connected remote machine (`on`), creating missing parent directories. Always asks the user '
      + 'every single time.',
    promptSnippet: 'Write a local or remote file atomically via herdr-core',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path, or path relative to cwd' },
        content: { type: 'string', description: 'UTF-8 text content to write' },
        on: {
          type: 'string',
          description: 'Optional connected remote machine name from tuff_herdr_list_sessions',
        },
        cwd: { type: 'string', description: 'Optional working directory for relative paths' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'tuff_herdr_file_edit',
    label: 'Tuff: edit file via herdr',
    description:
      'Apply atomic exact-match search/replace edits to a UTF-8 text file via herdr-core on the '
      + 'local machine or a connected remote machine (`on`). Each `old` string must match exactly '
      + 'once; all edits apply or none do. Always asks the user every single time.',
    promptSnippet: 'Apply atomic exact-match edits to a local or remote file via herdr-core',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path, or path relative to cwd' },
        edits: {
          type: 'array',
          description: 'Non-overlapping exact search/replace pairs',
          items: {
            type: 'object',
            properties: {
              old: { type: 'string', description: 'Exact text to find (must match once)' },
              new: { type: 'string', description: 'Replacement text' },
            },
            required: ['old', 'new'],
          },
        },
        on: {
          type: 'string',
          description: 'Optional connected remote machine name from tuff_herdr_list_sessions',
        },
        cwd: { type: 'string', description: 'Optional working directory for relative paths' },
      },
      required: ['path', 'edits'],
    },
  },
  {
    name: 'tuff_herdr_run_terminal',
    label: 'Tuff: start herdr terminal',
    description:
      'Launch a new persistent terminal or agent template via herdr-core locally or on a '
      + 'connected remote machine (`on`). Always asks the user every single time.',
    promptSnippet: 'Start a persistent local or remote terminal session via herdr-core',
    parameters: {
      type: 'object',
      properties: {
        argv: {
          type: 'array',
          items: { type: 'string' },
          description: 'Program and arguments, or [templateName, ...args]',
        },
        line: {
          type: 'string',
          description: 'Shell command line to run instead of argv',
        },
        cwd: { type: 'string', description: 'Working directory for the new terminal' },
        on: {
          type: 'string',
          description: 'Optional connected remote machine name from tuff_herdr_list_sessions',
        },
        name: { type: 'string', description: 'Optional display name for the terminal' },
        keep: {
          type: 'boolean',
          description: 'Restart with a recovery shell if the process is unexpectedly lost',
        },
        labels: {
          type: 'object',
          description: 'Optional key/value metadata labels',
          additionalProperties: { type: 'string' },
        },
        cols: { type: 'number', description: 'Initial terminal width in columns' },
        rows: { type: 'number', description: 'Initial terminal height in rows' },
        env: {
          type: 'object',
          description: 'Optional environment variable overrides',
          additionalProperties: { type: 'string' },
        },
      },
    },
  },
  {
    name: 'tuff_herdr_exec',
    label: 'Tuff: run command via herdr',
    description:
      'Execute a non-interactive one-shot command via herdr-core (`machine.exec`) locally or on a '
      + 'connected remote machine (`on`), returning exit code, stdout, and stderr (truncated at 64 KiB). '
      + 'Always asks the user every single time.',
    promptSnippet: 'Execute a one-shot local or remote command via herdr-core',
    parameters: {
      type: 'object',
      properties: {
        argv: {
          type: 'array',
          items: { type: 'string' },
          description: 'Program and arguments executed directly without a shell',
        },
        line: {
          type: 'string',
          description: 'Shell command line executed instead of argv',
        },
        cwd: { type: 'string', description: 'Working directory for execution' },
        on: {
          type: 'string',
          description: 'Optional connected remote machine name from tuff_herdr_list_sessions',
        },
        env: {
          type: 'object',
          description: 'Optional environment variable overrides',
          additionalProperties: { type: 'string' },
        },
        timeout: {
          type: 'number',
          description: 'Optional timeout in seconds (default 60, max 600)',
        },
        input: {
          type: 'string',
          description: 'Optional UTF-8 stdin text',
        },
      },
    },
  },
  {
    name: 'tuff_herdr_control_terminal',
    label: 'Tuff: control herdr terminal',
    description:
      'Control a herdr-core terminal session: interrupt its current turn (`interrupt`), kill its '
      + 'process (`kill`), remove a finished session (`rm`), or toggle keep-alive (`keep-on` / '
      + '`keep-off`). Always asks the user every single time.',
    promptSnippet: 'Interrupt, kill, remove, or toggle keep-alive on a herdr-core terminal',
    parameters: {
      type: 'object',
      properties: {
        terminal: {
          type: 'string',
          description: 'Terminal address from tuff_herdr_list_sessions (e.g. t1 or rohan/t7)',
        },
        action: {
          type: 'string',
          enum: ['interrupt', 'kill', 'rm', 'keep-on', 'keep-off'],
          description: 'Control action to execute on the terminal',
        },
        timeout: {
          type: 'number',
          description: 'Optional timeout in seconds for the interrupt action',
        },
      },
      required: ['terminal', 'action'],
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
