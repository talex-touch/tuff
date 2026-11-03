import { redactProviderDetail } from './provider-detail-redaction'
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

const NETWORK_ERROR_CODE_MAP: Readonly<Record<string, StableToolErrorCode>> = {
  NETWORK_ABORTED: 'TOOL_EXECUTION_ABORTED',
  NETWORK_COOLDOWN_ACTIVE: 'TOOL_SERVICE_UNAVAILABLE',
  NETWORK_TIMEOUT: 'TOOL_EXECUTION_TIMEOUT',
  NETWORK_TRANSPORT_FAILED: 'TOOL_SERVICE_UNAVAILABLE'
}

const NETWORK_HTTP_STATUS_CODE = /^NETWORK_HTTP_STATUS_(\d+)$/

function projectNetworkHttpStatus(status: number): StableToolErrorCode {
  if (status === 401 || status === 403) return 'TOOL_RESOURCE_ACCESS_DENIED'
  if (status === 404 || status === 410) return 'TOOL_RESOURCE_NOT_FOUND'
  if (status === 408) return 'TOOL_EXECUTION_TIMEOUT'
  if (status === 429 || status >= 500) return 'TOOL_SERVICE_UNAVAILABLE'
  return 'TOOL_EXECUTION_FAILED'
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

  const code = readStringProperty(error, 'code')
  if (!code) return projectToolErrorCode(undefined)
  const httpStatus = NETWORK_HTTP_STATUS_CODE.exec(code)?.[1]
  if (httpStatus) return projectToolErrorCode(projectNetworkHttpStatus(Number(httpStatus)))
  return projectToolErrorCode(NETWORK_ERROR_CODE_MAP[code] ?? NODE_ERROR_CODE_MAP[code])
}

export function formatStableToolError(error: StableToolErrorProjection): string {
  return `${error.code}: ${error.message}`
}

const DETAIL_STACK_FRAMES = 3

function readProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined
  try {
    return (value as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

function safeUrlLabel(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return undefined
  }
}

function describeFailureParts(error: unknown, depth: number): string[] {
  if (typeof error === 'string') return [`message=${redactProviderDetail(error)}`]
  if (!error || typeof error !== 'object') return [`value=${redactProviderDetail(String(error))}`]

  const parts: string[] = []
  const name = readStringProperty(error, 'name')
  if (name) parts.push(`name=${name}`)
  const code = readStringProperty(error, 'code')
  if (code) parts.push(`code=${code}`)
  const status = readProperty(error, 'status')
  if (typeof status === 'number') parts.push(`status=${status}`)
  const url = safeUrlLabel(readProperty(error, 'url'))
  if (url) parts.push(`url=${url}`)
  const message = readStringProperty(error, 'message')
  if (message) parts.push(`message=${redactProviderDetail(message)}`)
  if (depth === 0) {
    const cause = readProperty(error, 'cause')
    if (cause !== undefined) parts.push(`cause={${describeFailureParts(cause, 1).join(' ')}}`)
    const frames = (readStringProperty(error, 'stack') ?? '')
      .split('\n')
      .slice(1, 1 + DETAIL_STACK_FRAMES)
      .map((line) => line.trim())
      .filter(Boolean)
    if (frames.length > 0) parts.push(`stack=${redactProviderDetail(frames.join(' <- '))}`)
  }
  return parts
}

// Log-only detail: the model and the renderer only ever receive the stable projection.
export function describeToolFailure(error: unknown): string {
  try {
    const mcpReason = readMcpFailureReason(error)
    if (mcpReason) return `mcpReason=${mcpReason}`
    return describeFailureParts(error, 0).join(' ') || 'detail=none'
  } catch {
    return 'detail=unreadable'
  }
}
