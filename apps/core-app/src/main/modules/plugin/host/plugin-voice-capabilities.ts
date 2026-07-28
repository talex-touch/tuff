import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { types as utilTypes } from 'node:util'
import type { PluginHostCapabilityDefinition } from './plugin-host-capabilities'
import type { PluginHostCapabilityResourceContext } from './plugin-host-resources'

export type PluginVoiceStreamEvent =
  | { readonly type: 'partial'; readonly text: string }
  | { readonly type: 'final'; readonly text: string; readonly language?: string }
  | { readonly type: 'end' }
  | { readonly type: 'error'; readonly code: 'VOICE_STREAM_FAILED' }

export interface PluginVoiceDictateRequest {
  readonly cleanup?: boolean
  readonly language?: string
  readonly maxDurationMs?: number
  readonly silenceStopMs?: number
}

export interface PluginVoiceSpeakRequest {
  readonly text: string
  readonly language?: string
  readonly voice?: string
  readonly play?: boolean
}

export interface PluginVoiceDictateResult {
  readonly text: string
  readonly raw: string
  readonly source: string
  readonly polished: boolean
  readonly language?: string
  readonly durationMs?: number
  readonly stoppedReason?: string
}

export interface PluginVoiceSpeakResult {
  readonly audio?: string
  readonly format: string
  readonly played: boolean
  readonly durationMs?: number
}

export interface PluginVoiceHostService {
  dictate(
    payload: PluginVoiceDictateRequest,
    signal: AbortSignal
  ): PluginVoiceDictateResult | Promise<PluginVoiceDictateResult>
  speak(
    payload: PluginVoiceSpeakRequest,
    signal: AbortSignal
  ): PluginVoiceSpeakResult | Promise<PluginVoiceSpeakResult>
  stream(
    payload: PluginVoiceDictateRequest,
    signal: AbortSignal
  ): AsyncIterable<PluginVoiceStreamEvent> | Promise<AsyncIterable<PluginVoiceStreamEvent>>
}

export interface PluginVoiceCapabilityOptions {
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  service: PluginVoiceHostService
}

export interface PluginVoiceCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
}

type VoiceInvokeRequest =
  | { readonly operation: 'dictate'; readonly payload: PluginVoiceDictateRequest }
  | { readonly operation: 'speak'; readonly payload: PluginVoiceSpeakRequest }

type VoiceInvokeResult =
  | { readonly operation: 'dictate'; readonly data: PluginVoiceDictateResult }
  | {
      readonly operation: 'speak'
      readonly data: {
        readonly format: string
        readonly played: boolean
        readonly durationMs?: number
      }
    }

interface VoiceStreamRequest {
  readonly payload: PluginVoiceDictateRequest
  readonly onEvent: (event: PluginVoiceStreamEvent) => unknown | Promise<unknown>
}

const MAX_TEXT_BYTES = 16 * 1024
const MAX_LANGUAGE_BYTES = 64
const MAX_VOICE_BYTES = 128
const MAX_SOURCE_BYTES = 128
const MAX_STOP_REASON_BYTES = 64
const MIN_CAPTURE_MS = 1_000
const MAX_CAPTURE_MS = 120_000
const MIN_SILENCE_MS = 250
const MAX_SILENCE_MS = 30_000

function invalid(): never {
  throw new Error('PLUGIN_VOICE_CAPABILITY_INVALID')
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

function optionalInteger(
  record: Record<string, unknown>,
  key: string,
  min: number,
  max: number
): number | undefined {
  if (!Object.hasOwn(record, key)) return undefined
  const value = record[key]
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) invalid()
  return Number(value)
}

function validateDictatePayload(value: unknown): PluginVoiceDictateRequest {
  const record = exactRecord(value, ['cleanup', 'language', 'maxDurationMs', 'silenceStopMs'])
  const cleanup = optionalBoolean(record, 'cleanup')
  const language = optionalString(record, 'language', MAX_LANGUAGE_BYTES)
  const maxDurationMs = optionalInteger(record, 'maxDurationMs', MIN_CAPTURE_MS, MAX_CAPTURE_MS)
  const silenceStopMs = optionalInteger(record, 'silenceStopMs', MIN_SILENCE_MS, MAX_SILENCE_MS)
  return Object.freeze({
    ...(cleanup === undefined ? {} : { cleanup }),
    ...(language === undefined ? {} : { language }),
    ...(maxDurationMs === undefined ? {} : { maxDurationMs }),
    ...(silenceStopMs === undefined ? {} : { silenceStopMs })
  })
}

function validateSpeakPayload(value: unknown): PluginVoiceSpeakRequest {
  const record = exactRecord(value, ['text', 'language', 'voice', 'play'], ['text'])
  const text = boundedString(required(record, 'text'), MAX_TEXT_BYTES)
  const language = optionalString(record, 'language', MAX_LANGUAGE_BYTES)
  const voice = optionalString(record, 'voice', MAX_VOICE_BYTES)
  const play = optionalBoolean(record, 'play')
  return Object.freeze({
    text,
    ...(language === undefined ? {} : { language }),
    ...(voice === undefined ? {} : { voice }),
    ...(play === undefined ? {} : { play })
  })
}

function validateInvokeRequest(value: unknown): VoiceInvokeRequest {
  const record = exactRecord(value, ['operation', 'payload'], ['operation', 'payload'])
  const operation = required(record, 'operation')
  if (operation === 'dictate') {
    return Object.freeze({ operation, payload: validateDictatePayload(record.payload) })
  }
  if (operation === 'speak') {
    return Object.freeze({ operation, payload: validateSpeakPayload(record.payload) })
  }
  invalid()
}

function validateDictateResult(value: unknown): PluginVoiceDictateResult {
  const record = exactRecord(
    value,
    ['text', 'raw', 'source', 'polished', 'language', 'durationMs', 'stoppedReason'],
    ['text', 'raw', 'source', 'polished']
  )
  const text = boundedString(required(record, 'text'), MAX_TEXT_BYTES, true)
  const raw = boundedString(required(record, 'raw'), MAX_TEXT_BYTES, true)
  const source = boundedString(required(record, 'source'), MAX_SOURCE_BYTES)
  if (typeof record.polished !== 'boolean') invalid()
  const language = optionalString(record, 'language', MAX_LANGUAGE_BYTES)
  const durationMs = optionalInteger(record, 'durationMs', 0, MAX_CAPTURE_MS + 10_000)
  const stoppedReason = optionalString(record, 'stoppedReason', MAX_STOP_REASON_BYTES)
  return Object.freeze({
    text,
    raw,
    source,
    polished: record.polished,
    ...(language === undefined ? {} : { language }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(stoppedReason === undefined ? {} : { stoppedReason })
  })
}

function validateSpeakResult(value: unknown): PluginVoiceSpeakResult {
  const record = exactRecord(
    value,
    ['audio', 'format', 'played', 'durationMs'],
    ['format', 'played']
  )
  if (Object.hasOwn(record, 'audio') && typeof record.audio !== 'string') invalid()
  const format = boundedString(required(record, 'format'), 32)
  if (typeof record.played !== 'boolean') invalid()
  const durationMs = optionalInteger(record, 'durationMs', 0, MAX_CAPTURE_MS + 10_000)
  return Object.freeze({
    ...(typeof record.audio === 'string' ? { audio: record.audio } : {}),
    format,
    played: record.played,
    ...(durationMs === undefined ? {} : { durationMs })
  })
}

function validateInvokeResult(value: unknown): VoiceInvokeResult {
  const record = exactRecord(value, ['operation', 'data'], ['operation', 'data'])
  if (record.operation === 'dictate') {
    return Object.freeze({ operation: 'dictate', data: validateDictateResult(record.data) })
  }
  if (record.operation === 'speak') {
    const result = validateSpeakResult(record.data)
    return Object.freeze({
      operation: 'speak',
      data: Object.freeze({
        format: result.format,
        played: result.played,
        ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs })
      })
    })
  }
  invalid()
}

function validateStreamRequest(value: unknown): VoiceStreamRequest {
  const record = exactRecord(value, ['payload', 'onEvent'], ['payload', 'onEvent'])
  if (typeof record.onEvent !== 'function') invalid()
  return Object.freeze({
    payload: validateDictatePayload(record.payload),
    onEvent: record.onEvent as VoiceStreamRequest['onEvent']
  })
}

function validateStreamEvent(value: unknown): PluginVoiceStreamEvent {
  const typeRecord = exactRecord(value, ['type', 'text', 'language', 'code'], ['type'])
  switch (typeRecord.type) {
    case 'partial':
      return Object.freeze({
        type: 'partial',
        text: boundedString(required(typeRecord, 'text'), MAX_TEXT_BYTES, true)
      })
    case 'final': {
      const language = optionalString(typeRecord, 'language', MAX_LANGUAGE_BYTES)
      return Object.freeze({
        type: 'final',
        text: boundedString(required(typeRecord, 'text'), MAX_TEXT_BYTES, true),
        ...(language === undefined ? {} : { language })
      })
    }
    case 'end':
      exactRecord(value, ['type'], ['type'])
      return Object.freeze({ type: 'end' })
    case 'error':
      if (typeRecord.code !== 'VOICE_STREAM_FAILED') invalid()
      return Object.freeze({ type: 'error', code: 'VOICE_STREAM_FAILED' })
    default:
      invalid()
  }
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
    name: boundedString(required(record, 'name'), 256),
    pluginInstanceId: boundedString(required(record, 'pluginInstanceId'), 256),
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

function freezeDefinition<Request, Result>(
  definition: PluginHostCapabilityDefinition<Request, Result>
): PluginHostCapabilityDefinition<Request, Result> {
  return Object.freeze({
    ...definition,
    callbackLifetime: definition.callbackLifetime ?? 'transient',
    callbackFields: Object.freeze([...(definition.callbackFields ?? [])])
  })
}

function startStreamPump(
  iterable: AsyncIterable<PluginVoiceStreamEvent>,
  request: VoiceStreamRequest,
  signal: AbortSignal,
  resources: PluginHostCapabilityResourceContext
): object {
  let iterator: AsyncIterator<PluginVoiceStreamEvent>
  try {
    iterator = iterable[Symbol.asyncIterator]()
  } catch {
    invalid()
  }
  if (!iterator || typeof iterator.next !== 'function') invalid()

  let disposed = false
  let disposePromise: Promise<void> | null = null
  const dispose = (): Promise<void> => {
    if (disposePromise) return disposePromise
    disposed = true
    signal.removeEventListener('abort', onAbort)
    disposePromise = Promise.resolve()
      .then(async () => {
        if (typeof iterator.return === 'function') await iterator.return()
      })
      .then(() => undefined)
    return disposePromise
  }
  const onAbort = (): void => {
    void dispose().catch(() => undefined)
  }
  signal.addEventListener('abort', onAbort, { once: true })
  const handle = resources.register('stream', dispose)

  setImmediate(() => {
    void (async () => {
      try {
        while (!disposed && !signal.aborted) {
          const step = await iterator.next()
          if (disposed || signal.aborted || step.done) break
          const event = validateStreamEvent(step.value)
          await request.onEvent(event)
          if (event.type === 'end' || event.type === 'error') break
        }
      } catch {
        if (!disposed && !signal.aborted) {
          try {
            await request.onEvent(Object.freeze({ type: 'error', code: 'VOICE_STREAM_FAILED' }))
          } catch {
            // Callback failure is contained; owner teardown/dispose remains authoritative.
          }
        }
      }
    })()
  })

  return handle
}

export function createPluginVoiceCapabilities(
  rawOptions: PluginVoiceCapabilityOptions
): PluginVoiceCapabilities {
  const options = exactRecord(
    rawOptions,
    ['resolveCurrentActivation', 'resolveHostGeneration', 'service'],
    ['resolveCurrentActivation', 'resolveHostGeneration', 'service']
  )
  if (
    typeof options.resolveCurrentActivation !== 'function' ||
    typeof options.resolveHostGeneration !== 'function'
  ) {
    invalid()
  }
  const serviceRecord = exactRecord(
    options.service,
    ['dictate', 'speak', 'stream'],
    ['dictate', 'speak', 'stream']
  )
  if (
    typeof serviceRecord.dictate !== 'function' ||
    typeof serviceRecord.speak !== 'function' ||
    typeof serviceRecord.stream !== 'function'
  ) {
    invalid()
  }
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginVoiceCapabilityOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginVoiceCapabilityOptions['resolveHostGeneration']
  const service = options.service as PluginVoiceHostService

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
    const expected: PluginActivationIdentity = {
      name: identity.pluginName,
      pluginInstanceId: identity.pluginInstanceId,
      activationGeneration: identity.activationGeneration,
      key: context.uniqueKey
    }
    if (
      !sameActivation(current, expected) ||
      resolveHostGeneration(current) !== identity.hostGeneration
    ) {
      invalid()
    }
    return current
  }

  const definitions: PluginHostCapabilityDefinition[] = [
    freezeDefinition({
      id: 'voice.invoke',
      permission: 'voice.dictation',
      timeoutMs: 120_000,
      maxConcurrency: 1,
      callbackLifetime: 'transient',
      callbackFields: [],
      validateRequest: validateInvokeRequest,
      validateResult: validateInvokeResult,
      async invoke(context, request, signal) {
        assertAuthority(context)
        const normalized = request as VoiceInvokeRequest
        if (normalized.operation === 'dictate') {
          const result = await service.dictate(normalized.payload, signal)
          return { operation: 'dictate', data: result }
        }
        const result = validateSpeakResult(await service.speak(normalized.payload, signal))
        return {
          operation: 'speak',
          data: {
            format: result.format,
            played: result.played,
            ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs })
          }
        }
      }
    }),
    freezeDefinition({
      id: 'voice.stream',
      permission: 'voice.dictation',
      timeoutMs: 30_000,
      maxConcurrency: 1,
      callbackLifetime: 'resource',
      callbackFields: ['onEvent'],
      validateRequest: validateStreamRequest,
      validateResult: (value) => value,
      async invoke(context, request, signal, resources) {
        assertAuthority(context)
        const normalized = request as VoiceStreamRequest
        const iterable = await service.stream(normalized.payload, signal)
        return startStreamPump(iterable, normalized, signal, resources)
      }
    })
  ]

  return Object.freeze({ definitions: Object.freeze(definitions) })
}
