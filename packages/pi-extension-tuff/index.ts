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
    name: 'tuff_render_chart',
    label: 'Tuff: render chart',
    description:
      'Draw a chart in the conversation from data you already have. Use this instead of describing '
      + 'a chart in text when the user asks for a report, breakdown or visualisation.',
    promptSnippet: 'Render a chart from data',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'bar | line | pie | scatter' },
        title: { type: 'string', description: 'Chart title' },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Category labels, one per data point',
        },
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
