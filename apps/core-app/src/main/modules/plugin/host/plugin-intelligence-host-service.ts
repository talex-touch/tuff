import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceProviderModelOption
} from '@talex-touch/tuff-intelligence'
import { types as utilTypes } from 'node:util'
import { getProviderModelOptions } from '../../ai/intelligence-provider-model-options'
import { tuffIntelligence } from '../../ai/intelligence-sdk'
import type {
  PluginIntelligenceCapabilityId,
  PluginIntelligenceChatPayload,
  PluginIntelligenceHostService,
  PluginIntelligenceInvokeServiceResult,
  PluginIntelligenceOcrPayload,
  PluginIntelligenceProviderModel
} from './plugin-intelligence-capabilities'

export type PluginIntelligenceHostServiceErrorCode =
  | 'PLUGIN_INTELLIGENCE_HOST_DEPENDENCIES_INVALID'
  | 'PLUGIN_INTELLIGENCE_HOST_INPUT_INVALID'
  | 'PLUGIN_INTELLIGENCE_HOST_RESULT_INVALID'

export class PluginIntelligenceHostServiceError extends Error {
  constructor(readonly code: PluginIntelligenceHostServiceErrorCode) {
    super(code)
    this.name = 'PluginIntelligenceHostServiceError'
  }
}

type HostIntelligenceInvokeOptions = IntelligenceInvokeOptions & {
  readonly signal: AbortSignal
}

interface IntelligenceSdkDependency {
  invoke(
    capabilityId: string,
    payload: unknown,
    options: HostIntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<unknown>>
}

export interface PluginIntelligenceHostServiceDependencies {
  intelligence: IntelligenceSdkDependency
  getProviderModelOptions(capabilityId: string): readonly IntelligenceProviderModelOption[]
}

const MAX_MESSAGES = 64
const MAX_MESSAGE_BYTES = 16 * 1024
const MAX_CHAT_BYTES = 64 * 1024
const MAX_IMAGE_DATA_URL_BYTES = Math.ceil((640 * 1024 * 4) / 3) + 64
const MAX_RESULT_TEXT_BYTES = 256 * 1024
const MAX_IDENTIFIER_BYTES = 256
const MAX_TEMPLATE_BYTES = 32 * 1024
const MAX_VARIABLES = 32
const MAX_VARIABLE_BYTES = 8 * 1024
const MAX_METADATA_LIST = 16
const MAX_PROVIDERS = 32
const MAX_MODELS = 64
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const OPTION_KEYS = Object.freeze([
  'preferredProviderId',
  'modelPreference',
  'promptTemplate',
  'promptVariables',
  'metadata'
])
const METADATA_KEYS = Object.freeze([
  'entry',
  'featureId',
  'requestId',
  'inputKinds',
  'aiCommandId',
  'aiCommandVersion',
  'capabilityId',
  'selectedProviderId',
  'selectedModel',
  'caller'
])
const SDK_RESULT_KEYS = Object.freeze([
  'result',
  'usage',
  'provider',
  'model',
  'traceId',
  'latency',
  'reasoning'
])
const OCR_RESULT_KEYS = Object.freeze([
  'text',
  'confidence',
  'language',
  'keywords',
  'suggestions',
  'blocks',
  'engine',
  'durationMs',
  'raw'
])

function fail(code: PluginIntelligenceHostServiceErrorCode): never {
  throw new PluginIntelligenceHostServiceError(code)
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  code: PluginIntelligenceHostServiceErrorCode
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

function selectedRecord(
  value: unknown,
  requiredKeys: readonly string[],
  code: PluginIntelligenceHostServiceErrorCode
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
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)) fail(code)
  }
  const output: Record<string, unknown> = Object.create(null)
  for (const key of requiredKeys) {
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) fail(code)
    output[key] = descriptor.value
  }
  return output
}

function exactArray(
  value: unknown,
  maxLength: number,
  code: PluginIntelligenceHostServiceErrorCode
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
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > maxLength) fail(code)
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
  code: PluginIntelligenceHostServiceErrorCode
): unknown {
  if (!Object.hasOwn(record, key)) fail(code)
  return record[key]
}

function boundedString(
  value: unknown,
  maximumBytes: number,
  code: PluginIntelligenceHostServiceErrorCode,
  allowEmpty = false
): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maximumBytes) fail(code)
  if (!allowEmpty && value.trim().length === 0) fail(code)
  return value
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  maximumBytes: number
): string | undefined {
  if (!Object.hasOwn(record, key)) return undefined
  return boundedString(record[key], maximumBytes, 'PLUGIN_INTELLIGENCE_HOST_INPUT_INVALID')
}

function stringArray(
  value: unknown,
  maximumLength: number,
  maximumBytes: number,
  code: PluginIntelligenceHostServiceErrorCode
): readonly string[] {
  return Object.freeze(
    exactArray(value, maximumLength, code).map((entry) => boundedString(entry, maximumBytes, code))
  )
}

function snapshotChatPayload(value: unknown): PluginIntelligenceChatPayload {
  const code = 'PLUGIN_INTELLIGENCE_HOST_INPUT_INVALID'
  const record = exactRecord(value, ['messages'], ['messages'], code)
  const messages = exactArray(required(record, 'messages', code), MAX_MESSAGES, code)
  if (messages.length === 0) fail(code)
  let bytes = 0
  const projected = messages.map((entry) => {
    const message = exactRecord(entry, ['role', 'content'], ['role', 'content'], code)
    const role = required(message, 'role', code)
    if (role !== 'system' && role !== 'user' && role !== 'assistant') fail(code)
    const content = boundedString(required(message, 'content', code), MAX_MESSAGE_BYTES, code, true)
    bytes += Buffer.byteLength(role, 'utf8') + Buffer.byteLength(content, 'utf8')
    if (bytes > MAX_CHAT_BYTES) fail(code)
    return Object.freeze({ role, content })
  })
  return Object.freeze({ messages: Object.freeze(projected) })
}

function snapshotOcrPayload(value: unknown): PluginIntelligenceOcrPayload {
  const code = 'PLUGIN_INTELLIGENCE_HOST_INPUT_INVALID'
  const record = exactRecord(
    value,
    ['source', 'language', 'includeLayout', 'includeKeywords'],
    ['source'],
    code
  )
  const source = exactRecord(
    required(record, 'source', code),
    ['type', 'dataUrl'],
    ['type', 'dataUrl'],
    code
  )
  if (required(source, 'type', code) !== 'data-url') fail(code)
  const dataUrl = boundedString(required(source, 'dataUrl', code), MAX_IMAGE_DATA_URL_BYTES, code)
  if (!/^data:image\/(?:png|jpeg|webp);base64,/.test(dataUrl)) fail(code)
  const language = optionalString(record, 'language', 64)
  const includeLayout = Object.hasOwn(record, 'includeLayout') ? record.includeLayout : undefined
  const includeKeywords = Object.hasOwn(record, 'includeKeywords')
    ? record.includeKeywords
    : undefined
  if (includeLayout !== undefined && typeof includeLayout !== 'boolean') fail(code)
  if (includeKeywords !== undefined && typeof includeKeywords !== 'boolean') fail(code)
  return Object.freeze({
    source: Object.freeze({ type: 'data-url' as const, dataUrl }),
    ...(language === undefined ? {} : { language }),
    ...(includeLayout === undefined ? {} : { includeLayout }),
    ...(includeKeywords === undefined ? {} : { includeKeywords })
  })
}

function snapshotPromptVariables(value: unknown): Readonly<Record<string, string>> {
  const code = 'PLUGIN_INTELLIGENCE_HOST_INPUT_INVALID'
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
      !('value' in descriptor)
    ) {
      fail(code)
    }
    output[key] = boundedString(descriptor.value, MAX_VARIABLE_BYTES, code, true)
  }
  return Object.freeze(output)
}

function snapshotMetadata(
  value: unknown,
  caller: string
): NonNullable<IntelligenceInvokeOptions['metadata']> {
  const code = 'PLUGIN_INTELLIGENCE_HOST_INPUT_INVALID'
  const record = exactRecord(value, METADATA_KEYS, [], code)
  const output: Record<string, unknown> = Object.create(null)
  for (const key of METADATA_KEYS) {
    if (key === 'caller' || !Object.hasOwn(record, key)) continue
    if (key === 'inputKinds') {
      output[key] = stringArray(record[key], MAX_METADATA_LIST, 64, code)
    } else {
      output[key] = boundedString(record[key], MAX_IDENTIFIER_BYTES, code)
    }
  }
  output.caller = caller
  return Object.freeze(output)
}

function snapshotOptions(
  value: unknown,
  caller: string,
  signal: AbortSignal
): HostIntelligenceInvokeOptions {
  const code = 'PLUGIN_INTELLIGENCE_HOST_INPUT_INVALID'
  const record =
    value === undefined ? Object.create(null) : exactRecord(value, OPTION_KEYS, [], code)
  const preferredProviderId = optionalString(record, 'preferredProviderId', MAX_IDENTIFIER_BYTES)
  const modelPreference = Object.hasOwn(record, 'modelPreference')
    ? stringArray(record.modelPreference, 8, MAX_IDENTIFIER_BYTES, code)
    : undefined
  const promptTemplate = optionalString(record, 'promptTemplate', MAX_TEMPLATE_BYTES)
  const promptVariables = Object.hasOwn(record, 'promptVariables')
    ? snapshotPromptVariables(record.promptVariables)
    : undefined
  const metadata = Object.hasOwn(record, 'metadata')
    ? snapshotMetadata(record.metadata, caller)
    : Object.freeze({ caller })
  return Object.freeze({
    ...(preferredProviderId === undefined ? {} : { preferredProviderId }),
    ...(modelPreference === undefined ? {} : { modelPreference: [...modelPreference] }),
    ...(promptTemplate === undefined ? {} : { promptTemplate }),
    ...(promptVariables === undefined ? {} : { promptVariables: { ...promptVariables } }),
    metadata: { ...metadata },
    signal
  })
}

function assertCallBoundary(
  capabilityId: unknown,
  signal: unknown,
  caller: unknown
): asserts capabilityId is PluginIntelligenceCapabilityId {
  if (
    (capabilityId !== 'text.chat' && capabilityId !== 'vision.ocr') ||
    !(signal instanceof AbortSignal) ||
    typeof caller !== 'string' ||
    Buffer.byteLength(caller, 'utf8') > MAX_IDENTIFIER_BYTES ||
    !/^plugin:[A-Za-z0-9._-]+$/.test(caller)
  ) {
    fail('PLUGIN_INTELLIGENCE_HOST_INPUT_INVALID')
  }
}

function assertModelBoundary(
  capabilityId: unknown,
  signal: unknown,
  caller: unknown
): asserts capabilityId is 'text.chat' {
  if (
    capabilityId !== 'text.chat' ||
    !(signal instanceof AbortSignal) ||
    typeof caller !== 'string' ||
    Buffer.byteLength(caller, 'utf8') > MAX_IDENTIFIER_BYTES ||
    !/^plugin:[A-Za-z0-9._-]+$/.test(caller)
  ) {
    fail('PLUGIN_INTELLIGENCE_HOST_INPUT_INVALID')
  }
}

function validateUsage(value: unknown): void {
  const code = 'PLUGIN_INTELLIGENCE_HOST_RESULT_INVALID'
  const record = exactRecord(
    value,
    ['promptTokens', 'completionTokens', 'totalTokens', 'cost'],
    ['promptTokens', 'completionTokens', 'totalTokens'],
    code
  )
  for (const key of ['promptTokens', 'completionTokens', 'totalTokens'] as const) {
    const item = record[key]
    if (!Number.isFinite(item) || Number(item) < 0) fail(code)
  }
  if (Object.hasOwn(record, 'cost') && (!Number.isFinite(record.cost) || Number(record.cost) < 0)) {
    fail(code)
  }
}

function projectInvokeResult(
  capabilityId: PluginIntelligenceCapabilityId,
  value: unknown
): PluginIntelligenceInvokeServiceResult {
  const code = 'PLUGIN_INTELLIGENCE_HOST_RESULT_INVALID'
  const record = exactRecord(value, SDK_RESULT_KEYS, SDK_RESULT_KEYS.slice(0, 6), code)
  validateUsage(required(record, 'usage', code))
  const rawResult = required(record, 'result', code)
  let result: string | { readonly text: string }
  if (capabilityId === 'text.chat') {
    result = boundedString(rawResult, MAX_RESULT_TEXT_BYTES, code, true)
  } else {
    const ocr = exactRecord(rawResult, OCR_RESULT_KEYS, ['text'], code)
    result = Object.freeze({
      text: boundedString(required(ocr, 'text', code), MAX_RESULT_TEXT_BYTES, code, true)
    })
  }
  const latency = required(record, 'latency', code)
  if (!Number.isFinite(latency) || Number(latency) < 0 || Number(latency) > 300_000) fail(code)
  return Object.freeze({
    result,
    provider: boundedString(required(record, 'provider', code), MAX_IDENTIFIER_BYTES, code),
    model: boundedString(required(record, 'model', code), MAX_IDENTIFIER_BYTES, code),
    traceId: boundedString(required(record, 'traceId', code), MAX_IDENTIFIER_BYTES, code),
    latency: Number(latency)
  })
}

function projectProvider(value: unknown): PluginIntelligenceProviderModel {
  const code = 'PLUGIN_INTELLIGENCE_HOST_RESULT_INVALID'
  const record = selectedRecord(
    value,
    [
      'providerId',
      'providerName',
      'providerType',
      'models',
      'defaultModel',
      'capabilities',
      'available'
    ],
    code
  )
  const capabilities = stringArray(record.capabilities, 16, 64, code)
  if (!capabilities.includes('text.chat')) fail(code)
  const defaultModel = record.defaultModel
  if (defaultModel !== null && typeof defaultModel !== 'string') fail(code)
  if (typeof record.available !== 'boolean') fail(code)
  return Object.freeze({
    providerId: boundedString(record.providerId, MAX_IDENTIFIER_BYTES, code),
    providerName: boundedString(record.providerName, MAX_IDENTIFIER_BYTES, code),
    providerType: boundedString(record.providerType, 64, code),
    models: stringArray(record.models, MAX_MODELS, MAX_IDENTIFIER_BYTES, code),
    defaultModel:
      defaultModel === null ? null : boundedString(defaultModel, MAX_IDENTIFIER_BYTES, code),
    capabilities: Object.freeze(['text.chat'] as const),
    available: record.available
  })
}

function cancelled(): never {
  throw Object.assign(new Error('INTELLIGENCE_OPERATION_CANCELLED'), {
    code: 'INTELLIGENCE_OPERATION_CANCELLED'
  })
}

const productionDependencies: PluginIntelligenceHostServiceDependencies = Object.freeze({
  intelligence: tuffIntelligence,
  getProviderModelOptions
})

export function createPluginIntelligenceHostService(
  rawDependencies: PluginIntelligenceHostServiceDependencies = productionDependencies
): PluginIntelligenceHostService {
  const code = 'PLUGIN_INTELLIGENCE_HOST_DEPENDENCIES_INVALID'
  const dependencies = exactRecord(
    rawDependencies,
    ['intelligence', 'getProviderModelOptions'],
    ['intelligence', 'getProviderModelOptions'],
    code
  )
  const intelligence = dependencies.intelligence
  if (!intelligence || typeof intelligence !== 'object' || utilTypes.isProxy(intelligence))
    fail(code)
  const invoke = Reflect.get(intelligence, 'invoke')
  const listProviderModels = dependencies.getProviderModelOptions
  if (
    typeof invoke !== 'function' ||
    utilTypes.isProxy(invoke) ||
    typeof listProviderModels !== 'function' ||
    utilTypes.isProxy(listProviderModels)
  ) {
    fail(code)
  }

  return Object.freeze({
    invoke: async (capabilityId, payload, options, signal, caller) => {
      assertCallBoundary(capabilityId, signal, caller)
      const projectedPayload =
        capabilityId === 'text.chat' ? snapshotChatPayload(payload) : snapshotOcrPayload(payload)
      const projectedOptions = snapshotOptions(options, caller, signal)
      const result = await Reflect.apply(invoke, intelligence, [
        capabilityId,
        projectedPayload,
        projectedOptions
      ])
      return projectInvokeResult(capabilityId, result)
    },
    listProviderModels: async (capabilityId, signal, caller) => {
      assertModelBoundary(capabilityId, signal, caller)
      if (signal.aborted) cancelled()
      const result = await Reflect.apply(listProviderModels, undefined, [capabilityId])
      if (signal.aborted) cancelled()
      return Object.freeze(
        exactArray(result, MAX_PROVIDERS, 'PLUGIN_INTELLIGENCE_HOST_RESULT_INVALID').map(
          projectProvider
        )
      )
    }
  })
}
