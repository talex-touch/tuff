export const APPROVAL_REQUIRED_PREFIX = 'APPROVAL_REQUIRED:'
export const INTERRUPTED_TOOL_CALL_PREFIX = 'INTERRUPTED_TOOL_CALL:'

const AI_RUN_CANCELLED = 'AI_RUN_CANCELLED: AI run was cancelled.'
const AI_RUN_INTERRUPTED = 'AI_RUN_INTERRUPTED: AI run was interrupted.'

export type PiApprovalKind = 'delegation' | 'mcp' | 'permission' | 'tool'

export interface PiApprovalRequirement {
  fingerprint: string
  kind: PiApprovalKind
  reason: string
}

const APPROVAL_REASONS: Readonly<Record<PiApprovalKind, string>> = {
  delegation: 'Agent delegation requires user approval.',
  mcp: 'MCP tool access requires user approval.',
  permission: 'Tool permissions require user approval.',
  tool: 'Tool access requires user approval.'
}

const APPROVAL_FINGERPRINT_PATTERN = /^(?:delegation:)?[a-f0-9]{64}$/
const TOOL_CALL_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/

class PiRuntimeControlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PiRuntimeControlError'
  }
}

class PiApprovalRequiredError extends PiRuntimeControlError {
  constructor(readonly requirement: PiApprovalRequirement) {
    super(`${APPROVAL_REQUIRED_PREFIX}${JSON.stringify(requirement)}`)
  }
}

class PiInterruptedToolCallError extends PiRuntimeControlError {}
class PiRunCancelledError extends PiRuntimeControlError {}
class PiRunInterruptedError extends PiRuntimeControlError {}

export function stableApprovalReason(kind: unknown): string {
  return typeof kind === 'string' && Object.hasOwn(APPROVAL_REASONS, kind)
    ? APPROVAL_REASONS[kind as PiApprovalKind]
    : APPROVAL_REASONS.tool
}

export function createApprovalRequiredError(kind: PiApprovalKind, fingerprint: string): Error {
  if (!APPROVAL_FINGERPRINT_PATTERN.test(fingerprint)) {
    throw new Error('Approval fingerprint is invalid')
  }
  return new PiApprovalRequiredError({
    kind,
    fingerprint,
    reason: stableApprovalReason(kind)
  })
}

export function createInterruptedToolCallError(toolCallId: string): Error {
  return new PiInterruptedToolCallError(`${INTERRUPTED_TOOL_CALL_PREFIX}${toolCallId}`)
}

export function createRunCancelledError(): Error {
  return new PiRunCancelledError(AI_RUN_CANCELLED)
}

export function createRunInterruptedError(): Error {
  return new PiRunInterruptedError(AI_RUN_INTERRUPTED)
}

export function isApprovalRequiredControlError(error: unknown): error is Error {
  return error instanceof PiApprovalRequiredError
}

export function approvalRequirementFromControlError(
  error: unknown
): PiApprovalRequirement | undefined {
  return error instanceof PiApprovalRequiredError ? error.requirement : undefined
}

export function isInterruptedToolCallControlError(error: unknown): error is Error {
  return error instanceof PiInterruptedToolCallError
}

export function isRunCancelledControlError(error: unknown): error is Error {
  return error instanceof PiRunCancelledError
}

export function isRunInterruptedControlError(error: unknown): error is Error {
  return error instanceof PiRunInterruptedError
}

export function isPiRuntimeControlError(error: unknown): error is Error {
  return error instanceof PiRuntimeControlError
}

export function parseApprovalRequirement(message: string): PiApprovalRequirement | undefined {
  if (!message.startsWith(APPROVAL_REQUIRED_PREFIX)) return undefined
  const raw = message.slice(APPROVAL_REQUIRED_PREFIX.length).trim()
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const fingerprint = typeof parsed.fingerprint === 'string' ? parsed.fingerprint.trim() : ''
    if (!APPROVAL_FINGERPRINT_PATTERN.test(fingerprint)) return undefined
    if (typeof parsed.kind !== 'string' || !Object.hasOwn(APPROVAL_REASONS, parsed.kind)) {
      return undefined
    }
    const kind = parsed.kind as PiApprovalKind
    return { fingerprint, kind, reason: stableApprovalReason(kind) }
  } catch {
    return undefined
  }
}

export function isInterruptedToolCallMessage(message: string, toolCallId?: string): boolean {
  if (!message.startsWith(INTERRUPTED_TOOL_CALL_PREFIX)) return false
  const candidate = message.slice(INTERRUPTED_TOOL_CALL_PREFIX.length)
  if (!TOOL_CALL_ID_PATTERN.test(candidate)) return false
  return toolCallId === undefined || candidate === toolCallId
}
