/**
 * The wire half of Tuff's local MCP server: JSON-RPC 2.0 envelopes, the three
 * methods a tools-only server must answer, and nothing else.
 *
 * Kept free of HTTP and Electron so the method semantics can be tested against
 * the spec directly — the listener in `mcp-host-server.ts` is then thin enough
 * to read in one pass.
 */

export const MCP_LATEST_PROTOCOL_VERSION = '2025-06-18'

/**
 * Versions this server answers with the *requested* string instead of its own.
 * A client that names a version it knows is telling us what dialect it speaks;
 * replying with a different one is only correct when we do not speak it.
 */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
  '2024-11-05',
  '2025-03-26',
  '2025-06-18'
]

export const MCP_SERVER_NAME = 'tuff'

/** JSON-RPC 2.0 error codes, per the spec's reserved range. */
export const JSON_RPC_PARSE_ERROR = -32700
export const JSON_RPC_INVALID_REQUEST = -32600
export const JSON_RPC_METHOD_NOT_FOUND = -32601
export const JSON_RPC_INVALID_PARAMS = -32602
export const JSON_RPC_INTERNAL_ERROR = -32603
/**
 * For failures of the transport itself — a wrong path, a wrong method, a bad
 * token, an oversized body. These are not malformed requests, so `-32600`
 * would be a lie about who is at fault.
 */
export const JSON_RPC_SERVER_ERROR = -32000

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: unknown
}

export interface JsonRpcErrorObject {
  code: number
  message: string
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: JsonRpcErrorObject
}

/**
 * One capability offered to a connected agent. `inputSchema` is the JSON Schema
 * the client sees: it is the only description of the arguments a model has
 * before it calls, so it is hand-written per tool rather than inferred.
 */
export interface McpToolDescriptor {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpCallOutcome {
  output: string
  isError: boolean
}

export interface McpDispatchDeps {
  serverVersion: string
  /** The tools this server currently exposes, already filtered by the user's choices. */
  listTools: () => McpToolDescriptor[]
  /** Runs one call after the confirmation gate has had its say. */
  callTool: (
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal
  ) => Promise<McpCallOutcome>
  /** Sent to the client in `initialize`; the one place to explain the gate. */
  instructions?: string
}

function errorResponse(id: string | number | null, error: JsonRpcErrorObject): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error }
}

/** A request without an `id` is a notification: it must be answered with silence. */
export function isNotification(request: JsonRpcRequest): boolean {
  return request.id === undefined || request.id === null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses one JSON-RPC envelope. A batch (array) is rejected rather than
 * supported: MCP streams one message per request, and silently answering only
 * the first element would look like a lost reply to the client.
 */
export function parseJsonRpcRequest(
  raw: string
): { request: JsonRpcRequest } | { failure: JsonRpcResponse } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { failure: errorResponse(null, { code: JSON_RPC_PARSE_ERROR, message: 'Parse error' }) }
  }

  if (!isRecord(parsed) || Array.isArray(parsed)) {
    return {
      failure: errorResponse(null, { code: JSON_RPC_INVALID_REQUEST, message: 'Invalid Request' })
    }
  }

  const { id, method, jsonrpc } = parsed
  const validId =
    id === undefined || id === null || typeof id === 'string' || typeof id === 'number'
  if (jsonrpc !== '2.0' || typeof method !== 'string' || !method || !validId) {
    return {
      failure: errorResponse(validId ? ((id ?? null) as string | number | null) : null, {
        code: JSON_RPC_INVALID_REQUEST,
        message: 'Invalid Request'
      })
    }
  }

  return {
    request: {
      jsonrpc: '2.0',
      id: (id ?? null) as string | number | null,
      method,
      params: parsed.params
    }
  }
}

function initializeResult(params: unknown, deps: McpDispatchDeps): unknown {
  const requested = isRecord(params) ? params.protocolVersion : undefined
  const protocolVersion =
    typeof requested === 'string' && MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
      ? requested
      : MCP_LATEST_PROTOCOL_VERSION

  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: MCP_SERVER_NAME, version: deps.serverVersion },
    ...(deps.instructions ? { instructions: deps.instructions } : {})
  }
}

function toolsListResult(deps: McpDispatchDeps): unknown {
  return { tools: deps.listTools() }
}

async function toolsCallResult(
  request: JsonRpcRequest,
  deps: McpDispatchDeps,
  signal: AbortSignal
): Promise<JsonRpcResponse> {
  const id = request.id ?? null
  const params = isRecord(request.params) ? request.params : null
  const name = params && typeof params.name === 'string' ? params.name : ''
  if (!name) {
    return errorResponse(id, { code: JSON_RPC_INVALID_PARAMS, message: 'Missing tool name' })
  }

  // An unknown name is a protocol-level mistake by the client, not a tool that
  // ran and failed — those are reported as `isError` results below.
  const known = deps.listTools().some((tool) => tool.name === name)
  if (!known) {
    return errorResponse(id, {
      code: JSON_RPC_INVALID_PARAMS,
      message: `Unknown tool: ${name}`
    })
  }

  const rawArgs = params?.arguments
  const args = isRecord(rawArgs) ? rawArgs : {}

  try {
    const outcome = await deps.callTool(name, args, signal)
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: outcome.output }],
        isError: outcome.isError
      }
    }
  } catch {
    // The tool layer already turns its own failures into outcomes; reaching
    // here means the host itself threw, which the client must not read as a
    // successful empty answer.
    return errorResponse(id, { code: JSON_RPC_INTERNAL_ERROR, message: 'Tool execution failed' })
  }
}

/**
 * Answers one request. Returns `null` for notifications, which the transport
 * must turn into an empty 202 rather than a body.
 */
export async function dispatchMcpRequest(
  request: JsonRpcRequest,
  deps: McpDispatchDeps,
  signal: AbortSignal
): Promise<JsonRpcResponse | null> {
  if (isNotification(request)) return null

  const id = request.id ?? null
  switch (request.method) {
    case 'initialize':
      return { jsonrpc: '2.0', id, result: initializeResult(request.params, deps) }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} }
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: toolsListResult(deps) }
    case 'tools/call':
      return toolsCallResult(request, deps, signal)
    default:
      return errorResponse(id, {
        code: JSON_RPC_METHOD_NOT_FOUND,
        message: `Method not found: ${request.method}`
      })
  }
}
