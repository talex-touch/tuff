import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpDispatchDeps,
  McpToolDescriptor
} from './mcp-host-protocol'
import { describe, expect, it, vi } from 'vitest'
import {
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_PARSE_ERROR,
  MCP_LATEST_PROTOCOL_VERSION,
  dispatchMcpRequest,
  parseJsonRpcRequest
} from './mcp-host-protocol'

const READ_TOOL: McpToolDescriptor = {
  name: 'read_file',
  description: 'Read a file from the user machine',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
}

const WRITE_TOOL: McpToolDescriptor = {
  name: 'write_file',
  description: 'Write a file on the user machine',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
}

/** The tool layer is a spy here: these tests are about what a client observes. */
function deps(overrides: Partial<McpDispatchDeps> = {}): McpDispatchDeps {
  return {
    serverVersion: '1.0.0',
    listTools: () => [READ_TOOL],
    callTool: async () => ({ output: 'ok', isError: false }),
    ...overrides
  }
}

/** A dispatched request that was not a notification. */
async function answered(
  request: JsonRpcRequest,
  overrides: Partial<McpDispatchDeps> = {}
): Promise<JsonRpcResponse> {
  const response = await dispatchMcpRequest(request, deps(overrides), new AbortController().signal)
  if (!response) throw new Error('expected an answer, got notification silence')
  return response
}

describe('notifications', () => {
  it('answers a request without an id with silence', async () => {
    const response = await dispatchMcpRequest(
      { jsonrpc: '2.0', method: 'tools/call', params: { name: 'read_file', arguments: {} } },
      deps(),
      new AbortController().signal
    )

    expect(response).toBeNull()
  })

  it('treats id 0 as a real request, not as a notification', async () => {
    const response = await answered({ jsonrpc: '2.0', id: 0, method: 'tools/list' })

    expect(response.id).toBe(0)
    expect(response.result).toEqual({ tools: [READ_TOOL] })
  })
})

describe('initialize', () => {
  it.each([
    {
      case: 'a version it speaks',
      params: { protocolVersion: '2024-11-05' },
      expected: '2024-11-05'
    },
    {
      case: 'an unknown version',
      params: { protocolVersion: '1999-01-01' },
      expected: MCP_LATEST_PROTOCOL_VERSION
    },
    {
      case: 'a non-string version',
      params: { protocolVersion: 42 },
      expected: MCP_LATEST_PROTOCOL_VERSION
    },
    { case: 'no params at all', params: undefined, expected: MCP_LATEST_PROTOCOL_VERSION }
  ])('answers $case with a version the client can act on', async ({ params, expected }) => {
    const response = await answered({ jsonrpc: '2.0', id: 1, method: 'initialize', params })

    expect(response.result).toMatchObject({ protocolVersion: expected })
  })

  it('describes itself without promising a tool-change feed', async () => {
    const response = await answered({ jsonrpc: '2.0', id: 'init-1', method: 'initialize' })

    expect(response.id).toBe('init-1')
    expect(response.result).toMatchObject({
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'tuff' }
    })
  })
})

describe('tools/list', () => {
  it('returns exactly the tools the host currently exposes', async () => {
    const response = await answered(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { listTools: () => [READ_TOOL, WRITE_TOOL] }
    )

    expect(response.result).toEqual({ tools: [READ_TOOL, WRITE_TOOL] })
  })

  it('re-reads the list per request so a switched-off tool disappears without a restart', async () => {
    let exposed = [READ_TOOL, WRITE_TOOL]
    const overrides = { listTools: () => exposed }

    const before = await answered({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, overrides)
    exposed = [READ_TOOL]
    const after = await answered({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, overrides)

    expect(before.result).toEqual({ tools: [READ_TOOL, WRITE_TOOL] })
    expect(after.result).toEqual({ tools: [READ_TOOL] })
  })
})

describe('tools/call', () => {
  it('answers a successful call with the tool output as text content', async () => {
    const response = await answered(
      {
        jsonrpc: '2.0',
        id: 'call-1',
        method: 'tools/call',
        params: { name: 'read_file', arguments: { path: '~/notes.md' } }
      },
      { callTool: async () => ({ output: 'line one', isError: false }) }
    )

    expect(response.id).toBe('call-1')
    expect(response.result).toEqual({
      content: [{ type: 'text', text: 'line one' }],
      isError: false
    })
  })

  it('reports a tool that ran and refused as an isError result, not a JSON-RPC error', async () => {
    const response = await answered(
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'read_file', arguments: {} } },
      { callTool: async () => ({ output: 'The user declined to run read_file.', isError: true }) }
    )

    expect(response.error).toBeUndefined()
    expect(response.result).toEqual({
      content: [{ type: 'text', text: 'The user declined to run read_file.' }],
      isError: true
    })
  })

  it('rejects an unknown tool name without consulting the tool layer', async () => {
    const callTool = vi.fn(async () => ({ output: 'ran', isError: false }))
    const response = await answered(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'tuff_no_such_tool', arguments: {} }
      },
      { listTools: () => [READ_TOOL], callTool }
    )

    expect(response.error).toMatchObject({ code: JSON_RPC_INVALID_PARAMS })
    expect(response.error?.message).toContain('tuff_no_such_tool')
    expect(response.result).toBeUndefined()
    expect(callTool).not.toHaveBeenCalled()
  })

  it('requires a tool name instead of calling an unnamed tool', async () => {
    const callTool = vi.fn(async () => ({ output: 'ran', isError: false }))
    const response = await answered(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: {} },
      { callTool }
    )

    expect(response.error).toMatchObject({ code: JSON_RPC_INVALID_PARAMS })
    expect(response.result).toBeUndefined()
    expect(callTool).not.toHaveBeenCalled()
  })

  it('fails a throwing tool as an internal error rather than a successful empty answer', async () => {
    const response = await answered(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'read_file', arguments: {} } },
      {
        callTool: async () => {
          throw new Error('host exploded')
        }
      }
    )

    expect(response.error).toMatchObject({ code: JSON_RPC_INTERNAL_ERROR })
    expect(response.result).toBeUndefined()
  })
})

describe('unsupported methods', () => {
  it('answers a method this tools-only server does not implement with method-not-found', async () => {
    const response = await answered({ jsonrpc: '2.0', id: 9, method: 'resources/list' })

    expect(response.error).toMatchObject({ code: JSON_RPC_METHOD_NOT_FOUND })
    expect(response.result).toBeUndefined()
  })
})

describe('request envelopes', () => {
  it.each([
    { case: 'malformed JSON', raw: '{"jsonrpc":', code: JSON_RPC_PARSE_ERROR, id: null },
    {
      case: 'a batch array',
      raw: '[{"jsonrpc":"2.0","id":1,"method":"ping"}]',
      code: JSON_RPC_INVALID_REQUEST,
      id: null
    },
    { case: 'a JSON scalar', raw: '"initialize"', code: JSON_RPC_INVALID_REQUEST, id: null },
    {
      case: 'an envelope with no jsonrpc field',
      raw: '{"id":1,"method":"ping"}',
      code: JSON_RPC_INVALID_REQUEST,
      id: 1
    },
    {
      case: 'an envelope with no method',
      raw: '{"jsonrpc":"2.0","id":"a"}',
      code: JSON_RPC_INVALID_REQUEST,
      id: 'a'
    }
  ])('rejects $case', ({ raw, code, id }) => {
    const parsed = parseJsonRpcRequest(raw)

    if (!('failure' in parsed)) throw new Error(`expected ${raw} to be rejected`)
    expect(parsed.failure.error).toMatchObject({ code })
    expect(parsed.failure.id).toBe(id)
  })
})
