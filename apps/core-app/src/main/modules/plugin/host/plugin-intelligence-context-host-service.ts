import type {
  IntelligenceContextExecutionRequest,
  IntelligenceContextExecutionResult,
  IntelligenceInvokeOptions
} from '@talex-touch/utils/types/intelligence'
import { types as utilTypes } from 'node:util'
import type {
  IntelligenceContextActor,
  IntelligenceContextExecutionHostOptions
} from '../../ai/intelligence-context-execution'

export type PluginIntelligenceContextHostServiceErrorCode =
  | 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_DEPENDENCIES_INVALID'
  | 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID'
  | 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_RESULT_INVALID'

export class PluginIntelligenceContextHostServiceError extends Error {
  constructor(readonly code: PluginIntelligenceContextHostServiceErrorCode) {
    super(code)
    this.name = 'PluginIntelligenceContextHostServiceError'
  }
}

export interface PluginIntelligenceContextRequest {
  readonly operation: 'context.invoke'
  readonly capabilityId: 'text.chat'
  readonly input: string
  readonly payload: {
    readonly messages: readonly {
      readonly role: 'system' | 'user' | 'assistant'
      readonly content: string
    }[]
  }
  readonly options?: IntelligenceInvokeOptions
  readonly context: {
    readonly mode: 'new' | 'continue' | 'stateless'
    readonly owner?: 'corebox' | 'assistant'
    readonly sessionId?: string
    readonly scope?: 'light' | 'session' | 'retrieval'
    readonly objective?: string
    readonly tokenBudget?: number
    readonly traceId?: string
  }
}

export interface PluginIntelligenceContextSummary {
  readonly mode: 'new' | 'continue' | 'stateless'
  readonly scope: 'light' | 'session' | 'retrieval'
  readonly sessionId?: string
  readonly turnId?: string
  readonly packageId?: string
  readonly traceId?: string
  readonly itemCount: number
  readonly tokenBudget: number
  readonly tokenEstimate: number
  readonly sourceTypes: readonly (
    | 'current_input'
    | 'recent_turn'
    | 'summary'
    | 'memory'
    | 'retrieval'
  )[]
  readonly retrievalItemCount: number
  readonly citationCount: number
  readonly degradedReason?: string
}

export interface PluginIntelligenceContextResult {
  readonly operation: 'context.invoke'
  readonly invocation: {
    readonly result: string
    readonly providerId: string
    readonly modelId: string
    readonly traceId: string
    readonly latency: number
  }
  readonly context: PluginIntelligenceContextSummary
}

export interface PluginIntelligenceContextHostService {
  contextInvoke(
    request: unknown,
    signal: AbortSignal,
    caller: string
  ): Promise<PluginIntelligenceContextResult>
}

type ContextInvokeDependency = (
  request: IntelligenceContextExecutionRequest,
  actor: IntelligenceContextActor,
  options?: IntelligenceContextExecutionHostOptions
) => Promise<IntelligenceContextExecutionResult<unknown>>

export interface PluginIntelligenceContextHostServiceDependencies {
  invoke: ContextInvokeDependency
}

const MAX_INPUT_BYTES = 16 * 1024
const MAX_MESSAGES = 64
const MAX_MESSAGE_BYTES = 16 * 1024
const MAX_CHAT_BYTES = 64 * 1024
const MAX_RESULT_TEXT_BYTES = 256 * 1024
const MAX_IDENTIFIER_BYTES = 256
const MAX_OBJECTIVE_BYTES = 16 * 1024
const MAX_TEMPLATE_BYTES = 32 * 1024
const MAX_VARIABLES = 32
const MAX_VARIABLE_BYTES = 8 * 1024
const MAX_METADATA_LIST = 16
const MAX_SOURCE_TYPES = 16
const MAX_TOKEN_BUDGET = 16_000
const MAX_COUNT = 10_000
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const SOURCE_TYPES = new Set(['current_input', 'recent_turn', 'summary', 'memory', 'retrieval'])

function fail(code: PluginIntelligenceContextHostServiceErrorCode): never {
  throw new PluginIntelligenceContextHostServiceError(code)
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  code: PluginIntelligenceContextHostServiceErrorCode
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    fail(code)
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    fail(code)
  }
  if (prototype !== Object.prototype && prototype !== null) fail(code)
  const allowed = new Set(allowedKeys)
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key]
    if (
      typeof key !== 'string' ||
      FORBIDDEN_KEYS.has(key) ||
      !allowed.has(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      fail(code)
    }
    output[key] = descriptor.value
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(descriptors, key)) fail(code)
  }
  return output
}

function exactArray(
  value: unknown,
  maximumLength: number,
  code: PluginIntelligenceContextHostServiceErrorCode
): readonly unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) fail(code)
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    fail(code)
  }
  const lengthDescriptor = descriptors.length
  const length =
    lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > maximumLength) {
    fail(code)
  }
  const allowed = new Set<PropertyKey>(['length'])
  const output: unknown[] = []
  for (let index = 0; index < Number(length); index += 1) {
    const key = String(index)
    allowed.add(key)
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) fail(code)
    output.push(descriptor.value)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) fail(code)
  return output
}

function required(
  record: Record<string, unknown>,
  key: string,
  code: PluginIntelligenceContextHostServiceErrorCode
): unknown {
  if (!Object.hasOwn(record, key)) fail(code)
  return record[key]
}

function boundedString(
  value: unknown,
  maximumBytes: number,
  code: PluginIntelligenceContextHostServiceErrorCode,
  allowEmpty = false
): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maximumBytes) fail(code)
  if (!allowEmpty && value.trim().length === 0) fail(code)
  return value
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  maximumBytes: number,
  code: PluginIntelligenceContextHostServiceErrorCode
): string | undefined {
  if (!Object.hasOwn(record, key)) return undefined
  return boundedString(record[key], maximumBytes, code)
}

function boundedNumber(
  value: unknown,
  maximum: number,
  code: PluginIntelligenceContextHostServiceErrorCode,
  minimum = 0
): number {
  if (!Number.isFinite(value) || Number(value) < minimum || Number(value) > maximum) fail(code)
  return Number(value)
}

function safeInteger(
  value: unknown,
  maximum: number,
  code: PluginIntelligenceContextHostServiceErrorCode,
  minimum = 0
): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) fail(code)
  return Number(value)
}

function validateUsage(value: unknown): void {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_RESULT_INVALID'
  const record = exactRecord(
    value,
    ['promptTokens', 'completionTokens', 'totalTokens', 'cost'],
    ['promptTokens', 'completionTokens', 'totalTokens'],
    code
  )
  for (const key of ['promptTokens', 'completionTokens', 'totalTokens'] as const) {
    safeInteger(record[key], Number.MAX_SAFE_INTEGER, code)
  }
  if (Object.hasOwn(record, 'cost')) {
    boundedNumber(record.cost, Number.MAX_SAFE_INTEGER, code)
  }
}

function stringArray(
  value: unknown,
  maximumLength: number,
  maximumBytes: number,
  code: PluginIntelligenceContextHostServiceErrorCode
): readonly string[] {
  return Object.freeze(
    exactArray(value, maximumLength, code).map((entry) => boundedString(entry, maximumBytes, code))
  )
}

function snapshotMessages(value: unknown): PluginIntelligenceContextRequest['payload'] {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID'
  const payload = exactRecord(value, ['messages'], ['messages'], code)
  const messages = exactArray(required(payload, 'messages', code), MAX_MESSAGES, code)
  if (messages.length === 0) fail(code)
  let totalBytes = 0
  const projected = messages.map((entry) => {
    const message = exactRecord(entry, ['role', 'content'], ['role', 'content'], code)
    const role = required(message, 'role', code)
    if (role !== 'system' && role !== 'user' && role !== 'assistant') fail(code)
    const content = boundedString(required(message, 'content', code), MAX_MESSAGE_BYTES, code, true)
    totalBytes += Buffer.byteLength(role, 'utf8') + Buffer.byteLength(content, 'utf8')
    if (totalBytes > MAX_CHAT_BYTES) fail(code)
    return Object.freeze({ role, content })
  })
  return Object.freeze({ messages: Object.freeze(projected) })
}

function snapshotPromptVariables(value: unknown): Readonly<Record<string, string>> {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID'
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    fail(code)
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    fail(code)
  }
  if (prototype !== Object.prototype && prototype !== null) fail(code)
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length > MAX_VARIABLES) fail(code)
  const output: Record<string, string> = Object.create(null)
  for (const key of keys) {
    const descriptor = descriptors[key]
    if (
      typeof key !== 'string' ||
      FORBIDDEN_KEYS.has(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor) ||
      Buffer.byteLength(key, 'utf8') > 128
    ) {
      fail(code)
    }
    output[key] = boundedString(descriptor.value, MAX_VARIABLE_BYTES, code, true)
  }
  return Object.freeze(output)
}

function snapshotEntrypoint(value: unknown): Readonly<Record<string, string>> {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID'
  const record = exactRecord(value, ['id', 'owner', 'mode'], ['id', 'owner', 'mode'], code)
  const id = boundedString(required(record, 'id', code), MAX_IDENTIFIER_BYTES, code)
  const owner = required(record, 'owner', code)
  const mode = required(record, 'mode', code)
  if (owner !== 'corebox' && owner !== 'assistant') fail(code)
  if (mode !== 'new' && mode !== 'continue' && mode !== 'stateless') fail(code)
  if (
    (id !== 'corebox.ai-ask' || owner !== 'corebox') &&
    (id !== 'assistant.voice' || owner !== 'assistant')
  ) {
    fail(code)
  }
  return Object.freeze({ id, owner, mode })
}

function snapshotMetadata(
  value: unknown,
  caller?: string
): NonNullable<IntelligenceInvokeOptions['metadata']> {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID'
  const record = exactRecord(
    value,
    [
      'entry',
      'featureId',
      'requestId',
      'inputKinds',
      'aiCommandId',
      'aiCommandVersion',
      'capabilityId',
      'selectedProviderId',
      'selectedModel',
      'contextEntrypoint'
    ],
    [],
    code
  )
  const output: Record<string, unknown> = Object.create(null)
  for (const key of [
    'entry',
    'featureId',
    'requestId',
    'aiCommandId',
    'aiCommandVersion',
    'selectedProviderId',
    'selectedModel'
  ]) {
    if (Object.hasOwn(record, key)) {
      output[key] = boundedString(record[key], MAX_IDENTIFIER_BYTES, code)
    }
  }
  if (Object.hasOwn(record, 'inputKinds')) {
    output.inputKinds = stringArray(record.inputKinds, MAX_METADATA_LIST, 64, code)
  }
  if (Object.hasOwn(record, 'capabilityId')) {
    if (record.capabilityId !== 'text.chat') fail(code)
    output.capabilityId = 'text.chat'
  }
  if (Object.hasOwn(record, 'contextEntrypoint')) {
    output.contextEntrypoint = snapshotEntrypoint(record.contextEntrypoint)
  } else if (value !== undefined) {
    fail(code)
  }
  if (caller !== undefined) output.caller = caller
  return Object.freeze(output)
}

function snapshotOptions(value: unknown, caller?: string): IntelligenceInvokeOptions | undefined {
  if (value === undefined) {
    return caller === undefined ? undefined : Object.freeze({ metadata: Object.freeze({ caller }) })
  }
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID'
  const record = exactRecord(
    value,
    ['preferredProviderId', 'modelPreference', 'promptTemplate', 'promptVariables', 'metadata'],
    [],
    code
  )
  const preferredProviderId = optionalString(
    record,
    'preferredProviderId',
    MAX_IDENTIFIER_BYTES,
    code
  )
  const modelPreference = Object.hasOwn(record, 'modelPreference')
    ? stringArray(record.modelPreference, 8, MAX_IDENTIFIER_BYTES, code)
    : undefined
  const promptTemplate = optionalString(record, 'promptTemplate', MAX_TEMPLATE_BYTES, code)
  const promptVariables = Object.hasOwn(record, 'promptVariables')
    ? snapshotPromptVariables(record.promptVariables)
    : undefined
  const metadata: Record<string, unknown> = Object.hasOwn(record, 'metadata')
    ? snapshotMetadata(record.metadata, caller)
    : Object.freeze({ ...(caller === undefined ? {} : { caller }) })
  if (
    typeof metadata.selectedProviderId === 'string' &&
    metadata.selectedProviderId !== preferredProviderId
  ) {
    fail(code)
  }
  if (
    typeof metadata.selectedModel === 'string' &&
    !modelPreference?.includes(metadata.selectedModel)
  ) {
    fail(code)
  }
  return Object.freeze({
    ...(preferredProviderId === undefined ? {} : { preferredProviderId }),
    ...(modelPreference === undefined ? {} : { modelPreference: [...modelPreference] }),
    ...(promptTemplate === undefined ? {} : { promptTemplate }),
    ...(promptVariables === undefined ? {} : { promptVariables: { ...promptVariables } }),
    metadata: { ...metadata }
  })
}

function snapshotContext(value: unknown): PluginIntelligenceContextRequest['context'] {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID'
  const record = exactRecord(
    value,
    ['mode', 'owner', 'sessionId', 'scope', 'objective', 'tokenBudget', 'traceId'],
    ['mode'],
    code
  )
  const mode = required(record, 'mode', code)
  if (mode !== 'new' && mode !== 'continue' && mode !== 'stateless') fail(code)
  const owner = Object.hasOwn(record, 'owner') ? record.owner : undefined
  if (owner !== undefined && owner !== 'corebox' && owner !== 'assistant') fail(code)
  const sessionId = optionalString(record, 'sessionId', MAX_IDENTIFIER_BYTES, code)
  if ((mode === 'continue') !== (sessionId !== undefined)) fail(code)
  const scope = Object.hasOwn(record, 'scope') ? record.scope : undefined
  if (scope !== undefined && scope !== 'light' && scope !== 'session' && scope !== 'retrieval') {
    fail(code)
  }
  const objective = optionalString(record, 'objective', MAX_OBJECTIVE_BYTES, code)
  const traceId = optionalString(record, 'traceId', MAX_IDENTIFIER_BYTES, code)
  const tokenBudget = Object.hasOwn(record, 'tokenBudget')
    ? safeInteger(record.tokenBudget, MAX_TOKEN_BUDGET, code, 1)
    : undefined
  return Object.freeze({
    mode,
    ...(owner === undefined ? {} : { owner }),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(scope === undefined ? {} : { scope }),
    ...(objective === undefined ? {} : { objective }),
    ...(tokenBudget === undefined ? {} : { tokenBudget }),
    ...(traceId === undefined ? {} : { traceId })
  })
}

export function validatePluginIntelligenceContextRequest(
  value: unknown,
  caller?: string
): PluginIntelligenceContextRequest {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID'
  const record = exactRecord(
    value,
    ['operation', 'capabilityId', 'input', 'payload', 'options', 'context'],
    ['operation', 'capabilityId', 'input', 'payload', 'context'],
    code
  )
  if (required(record, 'operation', code) !== 'context.invoke') fail(code)
  if (required(record, 'capabilityId', code) !== 'text.chat') fail(code)
  const input = boundedString(required(record, 'input', code), MAX_INPUT_BYTES, code)
  const payload = snapshotMessages(required(record, 'payload', code))
  const options = Object.hasOwn(record, 'options')
    ? snapshotOptions(record.options, caller)
    : snapshotOptions(undefined, caller)
  const context = snapshotContext(required(record, 'context', code))
  const entrypoint = options?.metadata?.contextEntrypoint
  if (!entrypoint || typeof entrypoint !== 'object') fail(code)
  const projected = entrypoint as { owner?: unknown; mode?: unknown }
  if ((context.owner ?? 'corebox') !== projected.owner || context.mode !== projected.mode) {
    fail(code)
  }
  return Object.freeze({
    operation: 'context.invoke',
    capabilityId: 'text.chat',
    input,
    payload,
    ...(options === undefined ? {} : { options }),
    context
  })
}

function projectSummary(value: unknown): PluginIntelligenceContextSummary {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_RESULT_INVALID'
  const record = exactRecord(
    value,
    [
      'mode',
      'scope',
      'sessionId',
      'turnId',
      'packageId',
      'traceId',
      'checkpoint',
      'continuation',
      'itemCount',
      'tokenBudget',
      'tokenEstimate',
      'sourceTypes',
      'retrievalItemCount',
      'citationCount',
      'degradedReason'
    ],
    [
      'mode',
      'scope',
      'itemCount',
      'tokenBudget',
      'tokenEstimate',
      'sourceTypes',
      'retrievalItemCount',
      'citationCount'
    ],
    code
  )
  const mode = required(record, 'mode', code)
  const scope = required(record, 'scope', code)
  if (mode !== 'new' && mode !== 'continue' && mode !== 'stateless') fail(code)
  if (scope !== 'light' && scope !== 'session' && scope !== 'retrieval') fail(code)
  const sourceTypes = stringArray(required(record, 'sourceTypes', code), MAX_SOURCE_TYPES, 32, code)
  if (sourceTypes.some((sourceType) => !SOURCE_TYPES.has(sourceType))) fail(code)
  const projectedSourceTypes = sourceTypes as PluginIntelligenceContextSummary['sourceTypes']
  const sessionId = optionalString(record, 'sessionId', MAX_IDENTIFIER_BYTES, code)
  const turnId = optionalString(record, 'turnId', MAX_IDENTIFIER_BYTES, code)
  const packageId = optionalString(record, 'packageId', MAX_IDENTIFIER_BYTES, code)
  const traceId = optionalString(record, 'traceId', MAX_IDENTIFIER_BYTES, code)
  const degradedReason = optionalString(record, 'degradedReason', MAX_IDENTIFIER_BYTES, code)
  return Object.freeze({
    mode,
    scope,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(turnId === undefined ? {} : { turnId }),
    ...(packageId === undefined ? {} : { packageId }),
    ...(traceId === undefined ? {} : { traceId }),
    itemCount: safeInteger(required(record, 'itemCount', code), MAX_COUNT, code),
    tokenBudget: safeInteger(required(record, 'tokenBudget', code), MAX_TOKEN_BUDGET, code, 1),
    tokenEstimate: safeInteger(required(record, 'tokenEstimate', code), MAX_TOKEN_BUDGET, code),
    sourceTypes: projectedSourceTypes,
    retrievalItemCount: safeInteger(required(record, 'retrievalItemCount', code), MAX_COUNT, code),
    citationCount: safeInteger(required(record, 'citationCount', code), MAX_COUNT, code),
    ...(degradedReason === undefined ? {} : { degradedReason })
  })
}

export function validatePluginIntelligenceContextSummary(
  value: unknown
): PluginIntelligenceContextSummary {
  return projectSummary(value)
}

function projectExecutionResult(value: unknown): PluginIntelligenceContextResult {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_RESULT_INVALID'
  const resultRecord = exactRecord(
    value,
    ['invocation', 'context'],
    ['invocation', 'context'],
    code
  )
  const invocation = exactRecord(
    required(resultRecord, 'invocation', code),
    ['result', 'usage', 'provider', 'model', 'traceId', 'latency', 'reasoning'],
    ['result', 'usage', 'provider', 'model', 'traceId', 'latency'],
    code
  )
  const rawResult = required(invocation, 'result', code)
  const result = boundedString(rawResult, MAX_RESULT_TEXT_BYTES, code, true)
  validateUsage(required(invocation, 'usage', code))
  if (Object.hasOwn(invocation, 'reasoning')) {
    boundedString(invocation.reasoning, MAX_RESULT_TEXT_BYTES, code, true)
  }
  const latency = boundedNumber(required(invocation, 'latency', code), 300_000, code)
  return Object.freeze({
    operation: 'context.invoke',
    invocation: Object.freeze({
      result,
      providerId: boundedString(required(invocation, 'provider', code), MAX_IDENTIFIER_BYTES, code),
      modelId: boundedString(required(invocation, 'model', code), MAX_IDENTIFIER_BYTES, code),
      traceId: boundedString(required(invocation, 'traceId', code), MAX_IDENTIFIER_BYTES, code),
      latency
    }),
    context: projectSummary(required(resultRecord, 'context', code))
  })
}

function assertEphemeralContext(
  value: unknown,
  projected: PluginIntelligenceContextSummary
): PluginIntelligenceContextSummary {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_RESULT_INVALID'
  const rawContext = exactRecord(
    value,
    [
      'mode',
      'scope',
      'sessionId',
      'turnId',
      'packageId',
      'traceId',
      'checkpoint',
      'continuation',
      'itemCount',
      'tokenBudget',
      'tokenEstimate',
      'sourceTypes',
      'retrievalItemCount',
      'citationCount',
      'degradedReason'
    ],
    [
      'mode',
      'scope',
      'itemCount',
      'tokenBudget',
      'tokenEstimate',
      'sourceTypes',
      'retrievalItemCount',
      'citationCount',
      'degradedReason'
    ],
    code
  )
  for (const key of ['sessionId', 'turnId', 'packageId', 'traceId', 'checkpoint', 'continuation']) {
    if (Object.hasOwn(rawContext, key)) fail(code)
  }
  if (
    (projected.mode !== 'new' && projected.mode !== 'stateless') ||
    projected.itemCount !== 1 ||
    projected.sourceTypes.length !== 1 ||
    projected.sourceTypes[0] !== 'current_input' ||
    projected.retrievalItemCount !== 0 ||
    projected.citationCount !== 0 ||
    projected.degradedReason !== 'isolated_context_persistence_unavailable'
  ) {
    fail(code)
  }
  return projected
}

function projectEphemeralExecutionResult(value: unknown): PluginIntelligenceContextResult {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_RESULT_INVALID'
  const resultRecord = exactRecord(
    value,
    ['invocation', 'context'],
    ['invocation', 'context'],
    code
  )
  const projected = projectExecutionResult(value)
  assertEphemeralContext(required(resultRecord, 'context', code), projected.context)
  return projected
}

export function validatePluginIntelligenceContextResult(
  value: unknown
): PluginIntelligenceContextResult {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_RESULT_INVALID'
  const record = exactRecord(
    value,
    ['operation', 'invocation', 'context'],
    ['operation', 'invocation', 'context'],
    code
  )
  if (required(record, 'operation', code) !== 'context.invoke') fail(code)
  const invocation = exactRecord(
    required(record, 'invocation', code),
    ['result', 'providerId', 'modelId', 'traceId', 'latency'],
    ['result', 'providerId', 'modelId', 'traceId', 'latency'],
    code
  )
  const rawContext = required(record, 'context', code)
  const context = assertEphemeralContext(rawContext, projectSummary(rawContext))
  return Object.freeze({
    operation: 'context.invoke',
    invocation: Object.freeze({
      result: boundedString(
        required(invocation, 'result', code),
        MAX_RESULT_TEXT_BYTES,
        code,
        true
      ),
      providerId: boundedString(
        required(invocation, 'providerId', code),
        MAX_IDENTIFIER_BYTES,
        code
      ),
      modelId: boundedString(required(invocation, 'modelId', code), MAX_IDENTIFIER_BYTES, code),
      traceId: boundedString(required(invocation, 'traceId', code), MAX_IDENTIFIER_BYTES, code),
      latency: boundedNumber(required(invocation, 'latency', code), 300_000, code)
    }),
    context
  })
}

function isDirectFunction(value: unknown): value is (...args: unknown[]) => unknown {
  if (typeof value !== 'function' || utilTypes.isProxy(value)) return false
  try {
    return !/^class\s/.test(Function.prototype.toString.call(value))
  } catch {
    return false
  }
}

function assertCallBoundary(signal: unknown, caller: unknown): asserts signal is AbortSignal {
  if (
    !(signal instanceof AbortSignal) ||
    typeof caller !== 'string' ||
    Buffer.byteLength(caller, 'utf8') > MAX_IDENTIFIER_BYTES ||
    !/^plugin:[A-Za-z0-9._-]+$/.test(caller)
  ) {
    fail('PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID')
  }
}

function cancelled(): never {
  throw Object.assign(new Error('INTELLIGENCE_OPERATION_CANCELLED'), {
    code: 'INTELLIGENCE_OPERATION_CANCELLED'
  })
}

export function createPluginIntelligenceContextHostService(
  rawDependencies: PluginIntelligenceContextHostServiceDependencies
): PluginIntelligenceContextHostService {
  const code = 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_DEPENDENCIES_INVALID'
  const dependencies = exactRecord(rawDependencies, ['invoke'], ['invoke'], code)
  const invoke = dependencies.invoke
  if (!isDirectFunction(invoke)) fail(code)

  return Object.freeze({
    contextInvoke: async (request, signal, caller) => {
      assertCallBoundary(signal, caller)
      if (signal.aborted) cancelled()
      const projectedRequest = validatePluginIntelligenceContextRequest(request, caller)
      const actor = Object.freeze({ id: caller, type: 'plugin' as const })
      const executionRequest: IntelligenceContextExecutionRequest = Object.freeze({
        capabilityId: projectedRequest.capabilityId,
        input: projectedRequest.input,
        payload: {
          messages: projectedRequest.payload.messages.map((message) => ({ ...message }))
        },
        ...(projectedRequest.options === undefined ? {} : { options: projectedRequest.options }),
        context: projectedRequest.context
      })
      let result: IntelligenceContextExecutionResult<unknown>
      try {
        const pending = Reflect.apply(invoke, undefined, [
          executionRequest,
          actor,
          Object.freeze({ signal, persistence: 'ephemeral' })
        ]) as Promise<IntelligenceContextExecutionResult<unknown>>
        result = await pending
      } catch (error) {
        if (signal.aborted) cancelled()
        throw error
      }
      if (signal.aborted) cancelled()
      return projectEphemeralExecutionResult(result)
    }
  })
}
