import type { TuffIcon, TuffQuery, TuffQueryInput } from './tuff/tuff-dsl'
import { TuffInputType } from './tuff/tuff-dsl'

export const CONTEXT_ACTIONS_PROVIDER_ID = 'context-actions'

export type ContextActionInputType = 'text' | 'image' | 'files' | 'html'
export type ContextActionInputSource = 'selected-text' | 'clipboard-image'
export type ContextActionProviderSource = 'builtin' | 'plugin'

export type ContextActionCaptureSupportLevel = 'supported' | 'best_effort' | 'unsupported'

export interface ContextActionCaptureDiagnostic {
  supportLevel: ContextActionCaptureSupportLevel
  issueCode?: string
  issueMessage?: string
  limitations?: string[]
}

interface ContextActionInputBase {
  source: ContextActionInputSource
  capturedAt: number
  available: boolean
  diagnostic?: ContextActionCaptureDiagnostic
}

export interface ContextActionTextInput extends ContextActionInputBase {
  type: 'text'
  source: 'selected-text'
  content: string
}

export interface ContextActionImageInput extends ContextActionInputBase {
  type: 'image'
  source: 'clipboard-image'
  content: string
  mimeType: 'image/png'
}

export type ContextActionInput = ContextActionTextInput | ContextActionImageInput

export type ContextActionUnavailableCode =
  | 'capability-unavailable'
  | 'input-invalid'
  | 'plugin-unavailable'
  | 'provider-unavailable'
  | 'unsupported-input'

export interface ContextActionUnavailableReason {
  code: ContextActionUnavailableCode
  message: string
  recoverable: boolean
}

export interface ContextActionMatch<TActionId extends string = string> {
  actionId: TActionId
  providerId: string
  providerDisplayName: string
  acceptedInputType: ContextActionInputType
  title: string
  description: string
  icon: TuffIcon
  priority: number
  source: {
    type: ContextActionProviderSource
    id: string
    displayName: string
  }
  available: boolean
  unavailableReason?: ContextActionUnavailableReason
}

export type ContextActionOutput =
  | {
      type: 'text'
      text: string
      label?: string
    }
  | {
      type: 'external'
      url: string
    }
  | {
      type: 'plugin'
      pluginName: string
      featureId: string
    }

export type ContextActionResult =
  | {
      status: 'success'
      message: string
      output?: ContextActionOutput
    }
  | {
      status: 'error'
      code: string
      message: string
      recoverable: boolean
    }

export interface ContextActionProvider<TActionId extends string = string> {
  readonly id: string
  readonly displayName: string
  readonly acceptedInputTypes: ContextActionInputType[]
  match(input: ContextActionInput): Promise<ContextActionMatch<TActionId>[]>
  execute(actionId: TActionId, input: ContextActionInput): Promise<ContextActionResult>
}

export interface ContextActionQueryContext {
  mode: 'context-actions'
  sessionId: string
  inputType: ContextActionInput['type']
  source: ContextActionInputSource
  capturedAt: number
  available: boolean
  diagnostic?: ContextActionCaptureDiagnostic
}

export interface ContextActionQuery extends TuffQuery {
  inputs: [TuffQueryInput]
  context: NonNullable<TuffQuery['context']> & {
    contextAction: ContextActionQueryContext
  }
}

export interface CoreBoxContextActionsOpenRequest {
  input: ContextActionInput
  context: ContextActionQueryContext
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeDiagnostic(value: unknown): ContextActionCaptureDiagnostic | undefined {
  if (!isRecord(value)) return undefined
  const supportLevel = value.supportLevel
  if (
    supportLevel !== 'supported' &&
    supportLevel !== 'best_effort' &&
    supportLevel !== 'unsupported'
  ) {
    return undefined
  }

  return {
    supportLevel,
    issueCode: typeof value.issueCode === 'string' ? value.issueCode : undefined,
    issueMessage: typeof value.issueMessage === 'string' ? value.issueMessage : undefined,
    limitations: Array.isArray(value.limitations)
      ? value.limitations.filter((item): item is string => typeof item === 'string')
      : undefined
  }
}

export function normalizeContextActionInput(value: unknown): ContextActionInput | null {
  if (!isRecord(value)) return null
  const capturedAt = typeof value.capturedAt === 'number' ? value.capturedAt : Number.NaN
  const content = typeof value.content === 'string' ? value.content : ''
  const available = value.available !== false
  if (!Number.isFinite(capturedAt) || (available && !content.trim())) return null

  const diagnostic = normalizeDiagnostic(value.diagnostic)
  if (value.type === 'text' && value.source === 'selected-text') {
    return {
      type: 'text',
      source: 'selected-text',
      content,
      capturedAt,
      available,
      diagnostic
    }
  }

  if (
    value.type === 'image' &&
    value.source === 'clipboard-image' &&
    value.mimeType === 'image/png' &&
    available &&
    content.startsWith('data:image/png;base64,')
  ) {
    return {
      type: 'image',
      source: 'clipboard-image',
      content,
      mimeType: 'image/png',
      capturedAt,
      available,
      diagnostic
    }
  }

  return null
}

export function createCoreBoxContextActionsOpenRequest(
  sessionId: string,
  input: ContextActionInput
): CoreBoxContextActionsOpenRequest {
  return {
    input,
    context: {
      mode: 'context-actions',
      sessionId,
      inputType: input.type,
      source: input.source,
      capturedAt: input.capturedAt,
      available: input.available,
      diagnostic: input.diagnostic
    }
  }
}

export function normalizeCoreBoxContextActionsOpenRequest(
  value: unknown
): CoreBoxContextActionsOpenRequest | null {
  if (!isRecord(value) || !isRecord(value.context)) return null
  const input = normalizeContextActionInput(value.input)
  if (!input) return null

  const sessionId = typeof value.context.sessionId === 'string' ? value.context.sessionId.trim() : ''
  if (!sessionId || value.context.mode !== 'context-actions') return null

  if (
    value.context.inputType !== input.type ||
    value.context.source !== input.source ||
    value.context.capturedAt !== input.capturedAt ||
    value.context.available !== input.available
  ) {
    return null
  }

  return createCoreBoxContextActionsOpenRequest(sessionId, input)
}

export function toContextActionQuery(request: CoreBoxContextActionsOpenRequest): ContextActionQuery {
  const input: TuffQueryInput = {
    type: request.input.type === 'text' ? TuffInputType.Text : TuffInputType.Image,
    content: request.input.content
  }

  return {
    text: '',
    inputs: [input],
    context: {
      session: request.context.sessionId,
      contextAction: request.context
    }
  }
}

export function isContextActionQuery(query: TuffQuery): query is ContextActionQuery {
  const contextAction = (query.context as ContextActionQuery['context'] | undefined)?.contextAction
  return (
    contextAction?.mode === 'context-actions' &&
    typeof contextAction.sessionId === 'string' &&
    contextAction.sessionId.trim().length > 0 &&
    Array.isArray(query.inputs) &&
    query.inputs.length === 1 &&
    query.inputs[0]?.type === contextAction.inputType
  )
}

export function getContextActionInput(query: TuffQuery): ContextActionInput | null {
  if (!isContextActionQuery(query)) return null
  const input = query.inputs[0]
  return normalizeContextActionInput({
    type: query.context.contextAction.inputType,
    source: query.context.contextAction.source,
    content: input.content,
    mimeType: query.context.contextAction.inputType === 'image' ? 'image/png' : undefined,
    capturedAt: query.context.contextAction.capturedAt,
    available: query.context.contextAction.available,
    diagnostic: query.context.contextAction.diagnostic
  })
}
