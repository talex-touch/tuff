import { readMcpFailureReason } from './intelligence-mcp-failure'

export const STABLE_TOOL_ERRORS = {
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
  TOOL_EXECUTION_FAILED: 'Tool execution failed.'
} as const

export type StableToolErrorCode = keyof typeof STABLE_TOOL_ERRORS

export interface StableToolErrorProjection {
  code: StableToolErrorCode
  message: (typeof STABLE_TOOL_ERRORS)[StableToolErrorCode]
}

const NODE_ERROR_CODE_MAP: Readonly<Record<string, StableToolErrorCode>> = {
  EACCES: 'TOOL_RESOURCE_ACCESS_DENIED',
  ECONNREFUSED: 'TOOL_SERVICE_UNAVAILABLE',
  ECONNRESET: 'TOOL_SERVICE_UNAVAILABLE',
  EEXIST: 'TOOL_RESOURCE_ALREADY_EXISTS',
  EHOSTUNREACH: 'TOOL_SERVICE_UNAVAILABLE',
  ENETUNREACH: 'TOOL_SERVICE_UNAVAILABLE',
  ENOENT: 'TOOL_RESOURCE_NOT_FOUND',
  ENOTDIR: 'TOOL_RESOURCE_NOT_FOUND',
  ENOTFOUND: 'TOOL_SERVICE_UNAVAILABLE',
  EPERM: 'TOOL_RESOURCE_ACCESS_DENIED',
  EPIPE: 'TOOL_SERVICE_UNAVAILABLE',
  ETIMEDOUT: 'TOOL_EXECUTION_TIMEOUT'
}

function readStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  try {
    const property = (value as Record<string, unknown>)[key]
    return typeof property === 'string' ? property : undefined
  } catch {
    return undefined
  }
}

export function projectToolErrorCode(code: unknown): StableToolErrorProjection {
  const safeCode =
    typeof code === 'string' && Object.hasOwn(STABLE_TOOL_ERRORS, code)
      ? (code as StableToolErrorCode)
      : 'TOOL_EXECUTION_FAILED'
  return { code: safeCode, message: STABLE_TOOL_ERRORS[safeCode] }
}

/**
 * Projects an arbitrary native/MCP failure into a fixed public contract.
 * Raw messages, stacks and causes are deliberately never read or retained.
 */
export function projectToolError(error: unknown): StableToolErrorProjection {
  let mcpReason: ReturnType<typeof readMcpFailureReason>
  try {
    mcpReason = readMcpFailureReason(error)
  } catch {
    mcpReason = undefined
  }
  if (mcpReason === 'server-unavailable') return projectToolErrorCode('MCP_SERVER_UNAVAILABLE')
  if (mcpReason === 'tool-failed') return projectToolErrorCode('MCP_TOOL_FAILED')

  if (readStringProperty(error, 'name') === 'AbortError') {
    return projectToolErrorCode('TOOL_EXECUTION_ABORTED')
  }

  const nodeCode = readStringProperty(error, 'code')
  return projectToolErrorCode(nodeCode ? NODE_ERROR_CODE_MAP[nodeCode] : undefined)
}

export function formatStableToolError(error: StableToolErrorProjection): string {
  return `${error.code}: ${error.message}`
}
