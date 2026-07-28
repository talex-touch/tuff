import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { types as utilTypes } from 'node:util'
import type { PluginHostCapabilityDefinition } from './plugin-host-capabilities'

export type PluginIntelligenceCapabilityId = 'text.chat' | 'vision.ocr'
export type PluginIntelligenceChatRole = 'system' | 'user' | 'assistant'

export interface PluginIntelligenceChatPayload {
  readonly messages: readonly {
    readonly role: PluginIntelligenceChatRole
    readonly content: string
  }[]
}

export interface PluginIntelligenceOcrPayload {
  readonly source: {
    readonly type: 'data-url'
    readonly dataUrl: string
  }
  readonly language?: string
  readonly includeLayout?: boolean
  readonly includeKeywords?: boolean
}

export interface PluginIntelligenceInvokeOptions {
  readonly preferredProviderId?: string
  readonly modelPreference?: readonly string[]
  readonly promptTemplate?: string
  readonly promptVariables?: Readonly<Record<string, string>>
  readonly metadata?: {
    readonly entry?: string
    readonly featureId?: string
    readonly requestId?: string
    readonly inputKinds?: readonly string[]
    readonly aiCommandId?: string
    readonly aiCommandVersion?: string
    readonly capabilityId?: PluginIntelligenceCapabilityId
    readonly selectedProviderId?: string
    readonly selectedModel?: string
  }
}

export interface PluginIntelligenceInvokeServiceResult {
  readonly result: string | { readonly text: string }
  readonly provider: string
  readonly model: string
  readonly traceId: string
  readonly latency: number
}

export interface PluginIntelligenceProviderModel {
  readonly providerId: string
  readonly providerName: string
  readonly providerType: string
  readonly models: readonly string[]
  readonly defaultModel: string | null
  readonly capabilities: readonly ['text.chat']
  readonly available: boolean
}

export interface PluginIntelligenceHostService {
  invoke(
    capabilityId: PluginIntelligenceCapabilityId,
    payload: PluginIntelligenceChatPayload | PluginIntelligenceOcrPayload,
    options: PluginIntelligenceInvokeOptions | undefined,
    signal: AbortSignal,
    caller: string
  ): PluginIntelligenceInvokeServiceResult | Promise<PluginIntelligenceInvokeServiceResult>
  listProviderModels(
    capabilityId: 'text.chat',
    signal: AbortSignal,
    caller: string
  ): readonly unknown[] | Promise<readonly unknown[]>
}

export interface PluginIntelligenceCapabilityOptions {
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  service: PluginIntelligenceHostService
}

export interface PluginIntelligenceCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
}

type IntelligenceRequest =
  | {
      readonly operation: 'capability.invoke'
      readonly capabilityId: PluginIntelligenceCapabilityId
      readonly payload: PluginIntelligenceChatPayload | PluginIntelligenceOcrPayload
      readonly options?: PluginIntelligenceInvokeOptions
    }
  | { readonly operation: 'provider-models.list'; readonly capabilityId: 'text.chat' }

type IntelligenceResult =
  | {
      readonly operation: 'capability.invoke'
      readonly result: string | { readonly text: string }
      readonly providerId: string
      readonly modelId: string
      readonly traceId: string
      readonly latency: number
    }
  | {
      readonly operation: 'provider-models.list'
      readonly providers: readonly PluginIntelligenceProviderModel[]
    }

const MAX_MESSAGES = 64
const MAX_MESSAGE_BYTES = 16 * 1024
const MAX_CHAT_BYTES = 64 * 1024
const MAX_IMAGE_BYTES = 640 * 1024
const MAX_RESULT_TEXT_BYTES = 256 * 1024
const MAX_IDENTIFIER_BYTES = 256
const MAX_TEMPLATE_BYTES = 32 * 1024
const MAX_VARIABLES = 32
const MAX_VARIABLE_BYTES = 8 * 1024
const MAX_METADATA_LIST = 16
const MAX_MODELS = 64
const MAX_PROVIDERS = 32
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const FORBIDDEN_VARIABLE_KEYS = new Set([
  'caller',
  'plugin',
  'pluginName',
  'key',
  'identity',
  'quota',
  'endpoint',
  'providerEndpoint',
  'credential',
  'credentials',
  'apiKey',
  'authorization',
  'cookie',
  'token'
])

function invalid(): never {
  throw new Error('PLUGIN_INTELLIGENCE_CAPABILITY_INVALID')
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = []
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalid()
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalid()
  }
  if (prototype !== Object.prototype && prototype !== null) invalid()
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
      invalid()
    }
    output[key] = descriptor.value
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(descriptors, key)) invalid()
  }
  return output
}

function exactArray(value: unknown, maxLength: number): readonly unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) invalid()
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    invalid()
  }
  const lengthDescriptor = descriptors.length
  const length =
    lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > maxLength) invalid()
  const output: unknown[] = []
  const allowed = new Set<PropertyKey>(['length'])
  for (let index = 0; index < Number(length); index += 1) {
    const key = String(index)
    allowed.add(key)
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    output.push(descriptor.value)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) invalid()
  return output
}

function required(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) invalid()
  return record[key]
}

function boundedString(value: unknown, maxBytes: number, allowEmpty = false): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maxBytes) invalid()
  if (!allowEmpty && value.trim().length === 0) invalid()
  return value
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  maxBytes: number
): string | undefined {
  if (!Object.hasOwn(record, key)) return undefined
  return boundedString(record[key], maxBytes)
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  if (!Object.hasOwn(record, key)) return undefined
  if (typeof record[key] !== 'boolean') invalid()
  return record[key]
}

function stringArray(value: unknown, maxLength: number, maxBytes: number): readonly string[] {
  const input = exactArray(value, maxLength)
  return Object.freeze(input.map((entry) => boundedString(entry, maxBytes)))
}

function validateChatPayload(value: unknown): PluginIntelligenceChatPayload {
  const record = exactRecord(value, ['messages'], ['messages'])
  const messages = exactArray(required(record, 'messages'), MAX_MESSAGES)
  if (messages.length === 0) invalid()
  let totalBytes = 0
  const projected = messages.map((message) => {
    const item = exactRecord(message, ['role', 'content'], ['role', 'content'])
    const role = required(item, 'role')
    if (role !== 'system' && role !== 'user' && role !== 'assistant') invalid()
    const content = boundedString(required(item, 'content'), MAX_MESSAGE_BYTES, true)
    totalBytes += Buffer.byteLength(role, 'utf8') + Buffer.byteLength(content, 'utf8')
    if (totalBytes > MAX_CHAT_BYTES) invalid()
    return Object.freeze({ role, content })
  })
  return Object.freeze({ messages: Object.freeze(projected) })
}

function hasImageSignature(kind: string, bytes: Buffer): boolean {
  if (kind === 'png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    )
  }
  if (kind === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  return (
    kind === 'webp' &&
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

function validateDataUrl(value: unknown): string {
  const dataUrl = boundedString(value, Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 64)
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) invalid()
  const encoded = match[2]!
  if (encoded.length % 4 !== 0) invalid()
  let decoded: Buffer
  try {
    decoded = Buffer.from(encoded, 'base64')
  } catch {
    invalid()
  }
  if (decoded.byteLength === 0 || decoded.byteLength > MAX_IMAGE_BYTES) invalid()
  if (decoded.toString('base64') !== encoded || !hasImageSignature(match[1]!, decoded)) invalid()
  return `data:image/${match[1]};base64,${encoded}`
}

function validateOcrPayload(value: unknown): PluginIntelligenceOcrPayload {
  const record = exactRecord(
    value,
    ['source', 'language', 'includeLayout', 'includeKeywords'],
    ['source']
  )
  const sourceRecord = exactRecord(
    required(record, 'source'),
    ['type', 'dataUrl'],
    ['type', 'dataUrl']
  )
  if (required(sourceRecord, 'type') !== 'data-url') invalid()
  const source = Object.freeze({
    type: 'data-url' as const,
    dataUrl: validateDataUrl(required(sourceRecord, 'dataUrl'))
  })
  const language = optionalString(record, 'language', 64)
  const includeLayout = optionalBoolean(record, 'includeLayout')
  const includeKeywords = optionalBoolean(record, 'includeKeywords')
  return Object.freeze({
    source,
    ...(language === undefined ? {} : { language }),
    ...(includeLayout === undefined ? {} : { includeLayout }),
    ...(includeKeywords === undefined ? {} : { includeKeywords })
  })
}

function validatePromptVariables(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value))
    invalid()
  let descriptors: PropertyDescriptorMap
  let prototype: object | null
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
    prototype = Object.getPrototypeOf(value)
  } catch {
    invalid()
  }
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length > MAX_VARIABLES) invalid()
  let totalBytes = 0
  const output: Record<string, string> = Object.create(null)
  for (const key of keys) {
    const descriptor = descriptors[key]
    if (
      typeof key !== 'string' ||
      FORBIDDEN_KEYS.has(key) ||
      FORBIDDEN_VARIABLE_KEYS.has(key) ||
      key.length === 0 ||
      Buffer.byteLength(key, 'utf8') > 128 ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      invalid()
    }
    const projected = boundedString(descriptor.value, MAX_VARIABLE_BYTES, true)
    totalBytes += Buffer.byteLength(key, 'utf8') + Buffer.byteLength(projected, 'utf8')
    if (totalBytes > MAX_TEMPLATE_BYTES) invalid()
    output[key] = projected
  }
  return Object.freeze(output)
}

function validateMetadata(
  value: unknown
): NonNullable<PluginIntelligenceInvokeOptions['metadata']> {
  const record = exactRecord(value, [
    'entry',
    'featureId',
    'requestId',
    'inputKinds',
    'aiCommandId',
    'aiCommandVersion',
    'capabilityId',
    'selectedProviderId',
    'selectedModel'
  ])
  const entry = optionalString(record, 'entry', MAX_IDENTIFIER_BYTES)
  const featureId = optionalString(record, 'featureId', MAX_IDENTIFIER_BYTES)
  const requestId = optionalString(record, 'requestId', MAX_IDENTIFIER_BYTES)
  const aiCommandId = optionalString(record, 'aiCommandId', MAX_IDENTIFIER_BYTES)
  const aiCommandVersion = optionalString(record, 'aiCommandVersion', 64)
  const capabilityId = Object.hasOwn(record, 'capabilityId')
    ? required(record, 'capabilityId')
    : undefined
  if (capabilityId !== undefined && capabilityId !== 'text.chat' && capabilityId !== 'vision.ocr') {
    invalid()
  }
  const selectedProviderId = optionalString(record, 'selectedProviderId', MAX_IDENTIFIER_BYTES)
  const selectedModel = optionalString(record, 'selectedModel', MAX_IDENTIFIER_BYTES)
  const inputKinds = Object.hasOwn(record, 'inputKinds')
    ? stringArray(record.inputKinds, MAX_METADATA_LIST, 64)
    : undefined
  return Object.freeze({
    ...(entry === undefined ? {} : { entry }),
    ...(featureId === undefined ? {} : { featureId }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(inputKinds === undefined ? {} : { inputKinds }),
    ...(aiCommandId === undefined ? {} : { aiCommandId }),
    ...(aiCommandVersion === undefined ? {} : { aiCommandVersion }),
    ...(capabilityId === undefined ? {} : { capabilityId }),
    ...(selectedProviderId === undefined ? {} : { selectedProviderId }),
    ...(selectedModel === undefined ? {} : { selectedModel })
  })
}

function validateOptions(value: unknown): PluginIntelligenceInvokeOptions {
  const record = exactRecord(value, [
    'preferredProviderId',
    'modelPreference',
    'promptTemplate',
    'promptVariables',
    'metadata'
  ])
  const preferredProviderId = optionalString(record, 'preferredProviderId', MAX_IDENTIFIER_BYTES)
  const modelPreference = Object.hasOwn(record, 'modelPreference')
    ? stringArray(record.modelPreference, 8, MAX_IDENTIFIER_BYTES)
    : undefined
  const promptTemplate = optionalString(record, 'promptTemplate', MAX_TEMPLATE_BYTES)
  const promptVariables = Object.hasOwn(record, 'promptVariables')
    ? validatePromptVariables(record.promptVariables)
    : undefined
  const metadata = Object.hasOwn(record, 'metadata') ? validateMetadata(record.metadata) : undefined
  return Object.freeze({
    ...(preferredProviderId === undefined ? {} : { preferredProviderId }),
    ...(modelPreference === undefined ? {} : { modelPreference }),
    ...(promptTemplate === undefined ? {} : { promptTemplate }),
    ...(promptVariables === undefined ? {} : { promptVariables }),
    ...(metadata === undefined ? {} : { metadata })
  })
}

function validateRequest(value: unknown): IntelligenceRequest {
  const record = exactRecord(
    value,
    ['operation', 'capabilityId', 'payload', 'options'],
    ['operation', 'capabilityId']
  )
  const operation = required(record, 'operation')
  const capabilityId = required(record, 'capabilityId')
  if (operation === 'provider-models.list') {
    if (
      capabilityId !== 'text.chat' ||
      Object.hasOwn(record, 'payload') ||
      Object.hasOwn(record, 'options')
    ) {
      invalid()
    }
    return Object.freeze({ operation, capabilityId })
  }
  if (
    operation !== 'capability.invoke' ||
    (capabilityId !== 'text.chat' && capabilityId !== 'vision.ocr')
  ) {
    invalid()
  }
  if (!Object.hasOwn(record, 'payload')) invalid()
  const payload =
    capabilityId === 'text.chat'
      ? validateChatPayload(record.payload)
      : validateOcrPayload(record.payload)
  const options = Object.hasOwn(record, 'options') ? validateOptions(record.options) : undefined
  const metadata = options?.metadata
  if (metadata?.capabilityId !== undefined && metadata.capabilityId !== capabilityId) invalid()
  if (
    metadata?.selectedProviderId !== undefined &&
    metadata.selectedProviderId !== options?.preferredProviderId
  ) {
    invalid()
  }
  if (
    metadata?.selectedModel !== undefined &&
    !options?.modelPreference?.includes(metadata.selectedModel)
  ) {
    invalid()
  }
  return Object.freeze({
    operation,
    capabilityId,
    payload,
    ...(options === undefined ? {} : { options })
  })
}

function validateInvokeResult(
  value: unknown
): Extract<IntelligenceResult, { operation: 'capability.invoke' }> {
  const record = exactRecord(
    value,
    ['result', 'provider', 'model', 'traceId', 'latency'],
    ['result', 'provider', 'model', 'traceId', 'latency']
  )
  const rawResult = required(record, 'result')
  let result: string | { readonly text: string }
  if (typeof rawResult === 'string') {
    result = boundedString(rawResult, MAX_RESULT_TEXT_BYTES, true)
  } else {
    const resultRecord = exactRecord(rawResult, ['text'], ['text'])
    result = Object.freeze({
      text: boundedString(required(resultRecord, 'text'), MAX_RESULT_TEXT_BYTES, true)
    })
  }
  const latency = required(record, 'latency')
  if (!Number.isFinite(latency) || Number(latency) < 0 || Number(latency) > 300_000) invalid()
  return Object.freeze({
    operation: 'capability.invoke',
    result,
    providerId: boundedString(required(record, 'provider'), MAX_IDENTIFIER_BYTES),
    modelId: boundedString(required(record, 'model'), MAX_IDENTIFIER_BYTES),
    traceId: boundedString(required(record, 'traceId'), MAX_IDENTIFIER_BYTES),
    latency: Number(latency)
  })
}

function validateProvider(value: unknown): PluginIntelligenceProviderModel {
  const record = exactRecord(
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
    [
      'providerId',
      'providerName',
      'providerType',
      'models',
      'defaultModel',
      'capabilities',
      'available'
    ]
  )
  const capabilities = stringArray(required(record, 'capabilities'), 16, 64)
  if (!capabilities.includes('text.chat') || new Set(capabilities).size !== capabilities.length) {
    invalid()
  }
  const available = required(record, 'available')
  if (typeof available !== 'boolean') invalid()
  const defaultModel = required(record, 'defaultModel')
  if (defaultModel !== null && typeof defaultModel !== 'string') invalid()
  return Object.freeze({
    providerId: boundedString(required(record, 'providerId'), MAX_IDENTIFIER_BYTES),
    providerName: boundedString(required(record, 'providerName'), MAX_IDENTIFIER_BYTES),
    providerType: boundedString(required(record, 'providerType'), 64),
    models: stringArray(required(record, 'models'), MAX_MODELS, MAX_IDENTIFIER_BYTES),
    defaultModel: defaultModel === null ? null : boundedString(defaultModel, MAX_IDENTIFIER_BYTES),
    capabilities: Object.freeze(['text.chat'] as const),
    available
  })
}

function validateResult(value: unknown): IntelligenceResult {
  const record = exactRecord(
    value,
    ['operation', 'result', 'providerId', 'modelId', 'traceId', 'latency', 'providers'],
    ['operation']
  )
  if (record.operation === 'capability.invoke') {
    const projected = exactRecord(
      value,
      ['operation', 'result', 'providerId', 'modelId', 'traceId', 'latency'],
      ['operation', 'result', 'providerId', 'modelId', 'traceId', 'latency']
    )
    const rawResult = required(projected, 'result')
    let result: string | { readonly text: string }
    if (typeof rawResult === 'string') {
      result = boundedString(rawResult, MAX_RESULT_TEXT_BYTES, true)
    } else {
      const resultRecord = exactRecord(rawResult, ['text'], ['text'])
      result = Object.freeze({
        text: boundedString(required(resultRecord, 'text'), MAX_RESULT_TEXT_BYTES, true)
      })
    }
    const latency = required(projected, 'latency')
    if (!Number.isFinite(latency) || Number(latency) < 0 || Number(latency) > 300_000) invalid()
    return Object.freeze({
      operation: 'capability.invoke',
      result,
      providerId: boundedString(required(projected, 'providerId'), MAX_IDENTIFIER_BYTES),
      modelId: boundedString(required(projected, 'modelId'), MAX_IDENTIFIER_BYTES),
      traceId: boundedString(required(projected, 'traceId'), MAX_IDENTIFIER_BYTES),
      latency: Number(latency)
    })
  }
  if (record.operation === 'provider-models.list') {
    const projected = exactRecord(value, ['operation', 'providers'], ['operation', 'providers'])
    const providers = exactArray(projected.providers, MAX_PROVIDERS).map(validateProvider)
    return Object.freeze({ operation: 'provider-models.list', providers: Object.freeze(providers) })
  }
  invalid()
}

function snapshotActivation(value: unknown): PluginActivationIdentity {
  const record = exactRecord(
    value,
    ['name', 'pluginInstanceId', 'activationGeneration', 'key'],
    ['name', 'pluginInstanceId', 'activationGeneration', 'key']
  )
  const activationGeneration = required(record, 'activationGeneration')
  if (!Number.isSafeInteger(activationGeneration) || Number(activationGeneration) < 1) invalid()
  return Object.freeze({
    name: boundedString(required(record, 'name'), MAX_IDENTIFIER_BYTES),
    pluginInstanceId: boundedString(required(record, 'pluginInstanceId'), MAX_IDENTIFIER_BYTES),
    activationGeneration: Number(activationGeneration),
    key: boundedString(required(record, 'key'), 512)
  })
}

function sameActivation(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  return (
    left.name === right.name &&
    left.pluginInstanceId === right.pluginInstanceId &&
    left.activationGeneration === right.activationGeneration &&
    left.key === right.key
  )
}

export function createPluginIntelligenceCapabilities(
  rawOptions: PluginIntelligenceCapabilityOptions
): PluginIntelligenceCapabilities {
  const options = exactRecord(
    rawOptions,
    ['resolveCurrentActivation', 'resolveHostGeneration', 'service'],
    ['resolveCurrentActivation', 'resolveHostGeneration', 'service']
  )
  if (
    typeof options.resolveCurrentActivation !== 'function' ||
    utilTypes.isProxy(options.resolveCurrentActivation) ||
    typeof options.resolveHostGeneration !== 'function' ||
    utilTypes.isProxy(options.resolveHostGeneration)
  ) {
    invalid()
  }
  const serviceRecord = exactRecord(
    options.service,
    ['invoke', 'listProviderModels'],
    ['invoke', 'listProviderModels']
  )
  if (
    typeof serviceRecord.invoke !== 'function' ||
    utilTypes.isProxy(serviceRecord.invoke) ||
    typeof serviceRecord.listProviderModels !== 'function' ||
    utilTypes.isProxy(serviceRecord.listProviderModels)
  ) {
    invalid()
  }
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginIntelligenceCapabilityOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginIntelligenceCapabilityOptions['resolveHostGeneration']
  const invokeService = serviceRecord.invoke as PluginIntelligenceHostService['invoke']
  const listProviderModels =
    serviceRecord.listProviderModels as PluginIntelligenceHostService['listProviderModels']

  const assertAuthority = (context: PluginSecurityContext): PluginActivationIdentity => {
    if (!isAuthoritativePluginContext(context)) invalid()
    const identity = context.identity
    if (
      identity.authority !== 'plugin-host' ||
      context.name !== identity.pluginName ||
      !Number.isSafeInteger(identity.hostGeneration) ||
      Number(identity.hostGeneration) < 1
    ) {
      invalid()
    }
    const current = snapshotActivation(resolveCurrentActivation(identity.pluginName))
    const expected = Object.freeze({
      name: identity.pluginName,
      pluginInstanceId: identity.pluginInstanceId,
      activationGeneration: identity.activationGeneration,
      key: context.uniqueKey
    })
    if (
      !sameActivation(current, expected) ||
      resolveHostGeneration(current) !== identity.hostGeneration
    ) {
      invalid()
    }
    return current
  }

  const definition: PluginHostCapabilityDefinition<IntelligenceRequest, IntelligenceResult> =
    Object.freeze({
      id: 'intelligence.invoke',
      permission: 'intelligence.basic',
      timeoutMs: 30_000,
      maxConcurrency: 4,
      callbackLifetime: 'transient',
      callbackFields: Object.freeze([]),
      validateRequest,
      validateResult,
      invoke: async (context, request, signal) => {
        const current = assertAuthority(context)
        const caller = `plugin:${current.name}`
        if (request.operation === 'provider-models.list') {
          const providers = await Reflect.apply(listProviderModels, undefined, [
            'text.chat',
            signal,
            caller
          ])
          return validateResult({ operation: 'provider-models.list', providers })
        }
        const result = await Reflect.apply(invokeService, undefined, [
          request.capabilityId,
          request.payload,
          request.options,
          signal,
          caller
        ])
        return validateInvokeResult(result)
      }
    })

  return Object.freeze({ definitions: Object.freeze([definition]) })
}
