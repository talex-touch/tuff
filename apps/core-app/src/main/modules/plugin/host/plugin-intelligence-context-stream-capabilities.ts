import type { IntelligenceContextStreamEvent } from '@talex-touch/utils/types/intelligence'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { types as utilTypes } from 'node:util'
import type { PluginHostCapabilityDefinition } from './plugin-host-capabilities'
import type { PluginHostCapabilityResourceContext } from './plugin-host-resources'
import {
  type PluginIntelligenceContextRequest,
  type PluginIntelligenceContextSummary,
  validatePluginIntelligenceContextRequest,
  validatePluginIntelligenceContextSummary
} from './plugin-intelligence-context-host-service'

export type PluginIntelligenceContextStreamEvent =
  | {
      readonly type: 'start'
      readonly capabilityId: 'text.chat'
      readonly provider?: string
      readonly model?: string
      readonly traceId?: string
      readonly context: PluginIntelligenceContextSummary
    }
  | {
      readonly type: 'delta'
      readonly capabilityId: 'text.chat'
      readonly delta: string
      readonly content?: string
      readonly provider?: string
      readonly model?: string
      readonly traceId?: string
    }
  | {
      readonly type: 'message'
      readonly capabilityId: 'text.chat'
      readonly message: {
        readonly role: 'system' | 'user' | 'assistant'
        readonly content: string
      }
      readonly provider?: string
      readonly model?: string
      readonly traceId?: string
    }
  | {
      readonly type: 'usage'
      readonly capabilityId: 'text.chat'
      readonly usage: {
        readonly promptTokens: number
        readonly completionTokens: number
        readonly totalTokens: number
      }
      readonly provider?: string
      readonly model?: string
      readonly traceId?: string
    }
  | {
      readonly type: 'metadata'
      readonly capabilityId: 'text.chat'
      readonly provider?: string
      readonly model?: string
      readonly traceId?: string
    }
  | {
      readonly type: 'end'
      readonly capabilityId: 'text.chat'
      readonly content: string
      readonly provider?: string
      readonly model?: string
      readonly traceId?: string
      readonly latency?: number
      readonly context: PluginIntelligenceContextSummary
    }
  | {
      readonly type: 'error'
      readonly capabilityId: 'text.chat'
      readonly code: 'INTELLIGENCE_STREAM_FAILED'
    }

interface PluginIntelligenceContextStreamRequest {
  readonly request: PluginIntelligenceContextRequest
  readonly onEvent: (event: PluginIntelligenceContextStreamEvent) => unknown | Promise<unknown>
}

export interface PluginIntelligenceContextStreamHostService {
  contextStream(
    request: PluginIntelligenceContextRequest,
    signal: AbortSignal,
    caller: string
  ): AsyncIterable<IntelligenceContextStreamEvent<unknown>>
}

export interface PluginIntelligenceContextStreamCapabilityOptions {
  readonly activation: PluginActivationIdentity
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  service: PluginIntelligenceContextStreamHostService
}

export interface PluginIntelligenceContextStreamCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
}

const MAX_IDENTIFIER_BYTES = 256
const MAX_EVENT_TEXT_BYTES = 64 * 1024
const MAX_FINAL_TEXT_BYTES = 256 * 1024
const MAX_TOKENS = 100_000_000
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function invalid(): never {
  throw new Error('PLUGIN_INTELLIGENCE_CONTEXT_STREAM_INVALID')
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
  for (const key of requiredKeys) if (!Object.hasOwn(descriptors, key)) invalid()
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
  return boundedString(record[key], maxBytes, true)
}

function optionalIdentityFields(record: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = Object.create(null)
  for (const key of ['provider', 'model', 'traceId']) {
    const value = optionalString(record, key, MAX_IDENTIFIER_BYTES)
    if (value !== undefined) output[key] = value
  }
  return output
}

function safeInteger(value: unknown, max = MAX_TOKENS): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) invalid()
  return Number(value)
}

function validateUsage(value: unknown): PluginIntelligenceContextStreamEvent & { type: 'usage' } {
  const event = exactRecord(
    value,
    ['type', 'capabilityId', 'usage', 'provider', 'model', 'traceId'],
    ['type', 'capabilityId', 'usage']
  )
  const usage = exactRecord(
    required(event, 'usage'),
    ['promptTokens', 'completionTokens', 'totalTokens', 'cost'],
    ['promptTokens', 'completionTokens', 'totalTokens']
  )
  return Object.freeze({
    type: 'usage',
    capabilityId: 'text.chat',
    usage: Object.freeze({
      promptTokens: safeInteger(usage.promptTokens),
      completionTokens: safeInteger(usage.completionTokens),
      totalTokens: safeInteger(usage.totalTokens)
    }),
    ...optionalIdentityFields(event)
  })
}

function validateEvent(value: unknown): PluginIntelligenceContextStreamEvent {
  const typeRecord = exactRecord(
    value,
    [
      'type',
      'capabilityId',
      'requestId',
      'traceId',
      'provider',
      'model',
      'delta',
      'content',
      'message',
      'result',
      'usage',
      'metadata',
      'context'
    ],
    ['type', 'capabilityId']
  )
  if (required(typeRecord, 'capabilityId') !== 'text.chat') invalid()
  const type = required(typeRecord, 'type')
  const identity = optionalIdentityFields(typeRecord)
  if (type === 'start') {
    const exact = exactRecord(
      value,
      ['type', 'capabilityId', 'requestId', 'traceId', 'provider', 'model', 'metadata', 'context'],
      ['type', 'capabilityId', 'context']
    )
    return Object.freeze({
      type,
      capabilityId: 'text.chat',
      ...identity,
      context: validatePluginIntelligenceContextSummary(exact.context)
    })
  }
  if (type === 'delta') {
    const exact = exactRecord(
      value,
      ['type', 'capabilityId', 'requestId', 'traceId', 'provider', 'model', 'delta', 'content'],
      ['type', 'capabilityId', 'delta']
    )
    const content = optionalString(exact, 'content', MAX_FINAL_TEXT_BYTES)
    return Object.freeze({
      type,
      capabilityId: 'text.chat',
      delta: boundedString(exact.delta, MAX_EVENT_TEXT_BYTES, true),
      ...(content === undefined ? {} : { content }),
      ...identity
    })
  }
  if (type === 'message') {
    const exact = exactRecord(
      value,
      ['type', 'capabilityId', 'requestId', 'traceId', 'provider', 'model', 'message'],
      ['type', 'capabilityId', 'message']
    )
    const message = exactRecord(exact.message, ['role', 'content'], ['role', 'content'])
    const role = message.role
    if (role !== 'system' && role !== 'user' && role !== 'assistant') invalid()
    return Object.freeze({
      type,
      capabilityId: 'text.chat',
      message: Object.freeze({
        role,
        content: boundedString(message.content, MAX_EVENT_TEXT_BYTES, true)
      }),
      ...identity
    })
  }
  if (type === 'usage') return validateUsage(value)
  if (type === 'metadata') {
    exactRecord(
      value,
      ['type', 'capabilityId', 'requestId', 'traceId', 'provider', 'model', 'metadata', 'context'],
      ['type', 'capabilityId']
    )
    return Object.freeze({ type, capabilityId: 'text.chat', ...identity })
  }
  if (type === 'end') {
    const exact = exactRecord(
      value,
      [
        'type',
        'capabilityId',
        'requestId',
        'traceId',
        'provider',
        'model',
        'content',
        'result',
        'usage',
        'metadata',
        'context'
      ],
      ['type', 'capabilityId', 'context']
    )
    const result = Object.hasOwn(exact, 'result')
      ? boundedString(exact.result, MAX_FINAL_TEXT_BYTES, true)
      : undefined
    const content = Object.hasOwn(exact, 'content')
      ? boundedString(exact.content, MAX_FINAL_TEXT_BYTES, true)
      : (result ?? '')
    let latency: number | undefined
    if (Object.hasOwn(exact, 'metadata')) {
      const metadata = exactRecord(exact.metadata, ['latency'])
      if (Object.hasOwn(metadata, 'latency')) {
        if (!Number.isFinite(metadata.latency) || Number(metadata.latency) < 0) invalid()
        latency = Math.min(Number(metadata.latency), 300_000)
      }
    }
    return Object.freeze({
      type,
      capabilityId: 'text.chat',
      content,
      ...identity,
      ...(latency === undefined ? {} : { latency }),
      context: validatePluginIntelligenceContextSummary(exact.context)
    })
  }
  invalid()
}

function validateRequest(value: unknown): PluginIntelligenceContextStreamRequest {
  const record = exactRecord(
    value,
    ['operation', 'capabilityId', 'input', 'payload', 'options', 'context', 'onEvent'],
    ['operation', 'capabilityId', 'input', 'payload', 'context', 'onEvent']
  )
  if (record.operation !== 'context.stream' || typeof record.onEvent !== 'function') invalid()
  const request = validatePluginIntelligenceContextRequest({
    operation: 'context.invoke',
    capabilityId: record.capabilityId,
    input: record.input,
    payload: record.payload,
    ...(Object.hasOwn(record, 'options') ? { options: record.options } : {}),
    context: record.context
  })
  return Object.freeze({
    request,
    onEvent: record.onEvent as PluginIntelligenceContextStreamRequest['onEvent']
  })
}

function snapshotActivation(value: unknown): PluginActivationIdentity {
  const record = exactRecord(
    value,
    ['name', 'pluginInstanceId', 'activationGeneration', 'key'],
    ['name', 'pluginInstanceId', 'activationGeneration', 'key']
  )
  if (
    !Number.isSafeInteger(record.activationGeneration) ||
    Number(record.activationGeneration) < 1
  ) {
    invalid()
  }
  return Object.freeze({
    name: boundedString(record.name, MAX_IDENTIFIER_BYTES),
    pluginInstanceId: boundedString(record.pluginInstanceId, MAX_IDENTIFIER_BYTES),
    activationGeneration: Number(record.activationGeneration),
    key: boundedString(record.key, 512)
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

function startStreamPump(
  iterable: AsyncIterable<IntelligenceContextStreamEvent<unknown>>,
  request: PluginIntelligenceContextStreamRequest,
  parentSignal: AbortSignal,
  streamController: AbortController,
  resources: PluginHostCapabilityResourceContext
): object {
  let iterator: AsyncIterator<IntelligenceContextStreamEvent<unknown>>
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
    parentSignal.removeEventListener('abort', onAbort)
    streamController.abort()
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
  parentSignal.addEventListener('abort', onAbort, { once: true })
  if (parentSignal.aborted) onAbort()
  const handle = resources.register('stream', dispose)

  setImmediate(() => {
    void (async () => {
      try {
        while (!disposed && !streamController.signal.aborted) {
          const step = await iterator.next()
          if (disposed || streamController.signal.aborted) break
          if (step.done) {
            await request.onEvent(
              Object.freeze({
                type: 'error',
                capabilityId: 'text.chat',
                code: 'INTELLIGENCE_STREAM_FAILED'
              })
            )
            break
          }
          const event = validateEvent(step.value)
          await request.onEvent(event)
          if (event.type === 'end' || event.type === 'error') break
        }
      } catch {
        if (!disposed && !streamController.signal.aborted) {
          try {
            await request.onEvent(
              Object.freeze({
                type: 'error',
                capabilityId: 'text.chat',
                code: 'INTELLIGENCE_STREAM_FAILED'
              })
            )
          } catch {
            // The resource disposer remains the authoritative cleanup path.
          }
          await dispose().catch(() => undefined)
        }
      }
    })()
  })

  return handle
}

export function createPluginIntelligenceContextStreamCapabilities(
  rawOptions: PluginIntelligenceContextStreamCapabilityOptions
): PluginIntelligenceContextStreamCapabilities {
  const options = exactRecord(
    rawOptions,
    ['activation', 'resolveCurrentActivation', 'resolveHostGeneration', 'service'],
    ['activation', 'resolveCurrentActivation', 'resolveHostGeneration', 'service']
  )
  const activation = snapshotActivation(options.activation)
  if (activation.name !== 'touch-intelligence') invalid()
  if (
    typeof options.resolveCurrentActivation !== 'function' ||
    utilTypes.isProxy(options.resolveCurrentActivation) ||
    typeof options.resolveHostGeneration !== 'function' ||
    utilTypes.isProxy(options.resolveHostGeneration)
  ) {
    invalid()
  }
  const service = exactRecord(options.service, ['contextStream'], ['contextStream'])
  if (typeof service.contextStream !== 'function' || utilTypes.isProxy(service.contextStream)) {
    invalid()
  }
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginIntelligenceContextStreamCapabilityOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginIntelligenceContextStreamCapabilityOptions['resolveHostGeneration']
  const contextStream =
    service.contextStream as PluginIntelligenceContextStreamHostService['contextStream']

  const assertAuthority = (context: PluginSecurityContext): PluginActivationIdentity => {
    if (!isAuthoritativePluginContext(context)) invalid()
    const identity = context.identity
    if (
      identity.authority !== 'plugin-host' ||
      identity.pluginName !== activation.name ||
      identity.pluginInstanceId !== activation.pluginInstanceId ||
      identity.activationGeneration !== activation.activationGeneration ||
      context.name !== activation.name ||
      context.uniqueKey !== activation.key ||
      !Number.isSafeInteger(identity.hostGeneration) ||
      Number(identity.hostGeneration) < 1
    ) {
      invalid()
    }
    const current = snapshotActivation(resolveCurrentActivation(activation.name))
    if (
      !sameActivation(current, activation) ||
      resolveHostGeneration(activation) !== identity.hostGeneration
    ) {
      invalid()
    }
    return current
  }

  const definition: PluginHostCapabilityDefinition = Object.freeze({
    id: 'intelligence.stream',
    permission: 'intelligence.basic',
    timeoutMs: 30_000,
    maxConcurrency: 2,
    callbackLifetime: 'resource',
    callbackFields: Object.freeze(['onEvent']),
    validateRequest,
    validateResult: (value) => value,
    async invoke(context, request, signal, resources) {
      const activation = assertAuthority(context)
      const normalized = request as PluginIntelligenceContextStreamRequest
      const streamController = new AbortController()
      const abortStream = (): void => streamController.abort()
      signal.addEventListener('abort', abortStream, { once: true })
      if (signal.aborted) abortStream()
      let iterable: AsyncIterable<IntelligenceContextStreamEvent<unknown>>
      try {
        iterable = Reflect.apply(contextStream, undefined, [
          normalized.request,
          streamController.signal,
          `plugin:${activation.name}`
        ])
      } catch (error) {
        signal.removeEventListener('abort', abortStream)
        streamController.abort()
        throw error
      }
      signal.removeEventListener('abort', abortStream)
      return startStreamPump(iterable, normalized, signal, streamController, resources)
    }
  })

  return Object.freeze({ definitions: Object.freeze([definition]) })
}
