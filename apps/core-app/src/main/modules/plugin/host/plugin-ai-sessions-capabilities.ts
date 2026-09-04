import { createHash } from 'node:crypto'
import { types as utilTypes } from 'node:util'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'
import { isPrivilegedPluginFor } from '../privileged-plugins'
import { hasControlCharacter } from './plugin-host-text-validation'

export type PluginAiSessionsPlatform =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'opencode'
  | 'trellis'
  | 'other'
export type PluginAiSessionsState = 'active' | 'completed' | 'failed' | 'cancelled' | 'unknown'
export type PluginAiSessionsReason =
  | 'permission-denied'
  | 'permission-unavailable'
  | 'source-disabled'
  | 'index-unavailable'
  | 'path-unsupported'
  | 'scan-limited'
  | 'cancelled'
  | 'timeout'

export interface PluginAiSessionMetadata {
  readonly id: string
  readonly platform: PluginAiSessionsPlatform
  readonly project: string
  readonly updatedAt: string
  readonly state: PluginAiSessionsState
  readonly turnCount: number | null
}

export interface PluginAiSessionsListRequest {
  readonly operation: 'list'
  readonly query?: string
  readonly limit: number
}

export type PluginAiSessionsSnapshot =
  | {
      readonly status: 'ready'
      readonly sessions: readonly PluginAiSessionMetadata[]
      readonly total: number
      readonly incomplete: boolean
    }
  | {
      readonly status: 'degraded' | 'unsupported'
      readonly sessions: readonly PluginAiSessionMetadata[]
      readonly total: 0
      readonly reason: PluginAiSessionsReason
    }

export interface TrustedPluginAiSessionsService {
  list(
    request: Readonly<{ query?: string; limit: number }>,
    signal: AbortSignal
  ): Promise<PluginAiSessionsSnapshot>
}

export interface PluginAiSessionsCapabilityOptions {
  readonly activation: PluginActivationIdentity
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeIntelligence(pluginName: string): boolean
  authorizeRead(pluginName: string): boolean
  watchIntelligencePermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  watchReadPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly service: TrustedPluginAiSessionsService
}

export interface PluginAiSessionsCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close(): Promise<void>
}

export interface PluginAiSessionSourceEntry {
  readonly platform: PluginAiSessionsPlatform
  readonly project: string
  readonly updatedAt: string
  readonly state: PluginAiSessionsState
  readonly turnCount: number | null
  readonly sourceId: string
}

export interface PluginAiSessionSourceSnapshot {
  readonly entries: readonly PluginAiSessionSourceEntry[]
  readonly incomplete: boolean
}

export interface FixedPluginAiSessionsServiceOptions {
  readonly listMetadata: (
    signal: AbortSignal
  ) => PluginAiSessionSourceSnapshot | Promise<PluginAiSessionSourceSnapshot>
}

const TRUSTED_SERVICES = new WeakSet<object>()
const MAX_QUERY_BYTES = 256
const MAX_LIMIT = 100
const MAX_PROJECT_BYTES = 96
const MAX_SOURCE_ID_BYTES = 1024
const MAX_SOURCE_ROWS = 2_000
const MAX_TOTAL = 1_000_000
const MAX_TURNS = 1_000_000
const PLATFORMS = new Set<PluginAiSessionsPlatform>([
  'claude',
  'codex',
  'gemini',
  'opencode',
  'trellis',
  'other'
])
const STATES = new Set<PluginAiSessionsState>([
  'active',
  'completed',
  'failed',
  'cancelled',
  'unknown'
])
const REASONS = new Set<PluginAiSessionsReason>([
  'permission-denied',
  'permission-unavailable',
  'source-disabled',
  'index-unavailable',
  'path-unsupported',
  'scan-limited',
  'cancelled',
  'timeout'
])
const SAFE_ID = /^[a-f0-9]{16}$/
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const SECRET_LIKE =
  /(?:api[_-]?key|password|passwd|secret|token|cookie|authorization|private[_-]?key|\bsk-[a-z0-9_-]{8,}|\bgh[oprsu]_[a-z0-9]{12,}|\bAKIA[A-Z0-9]{16})/i
const PATH_LIKE = /(?:^|\s)(?:~\/|\/Users\/|\/home\/|[A-Za-z]:\\|\\\\)/

function invalid(): never {
  throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = []
): Record<string, unknown> {
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
  const allowed = new Set(allowedKeys)
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key)) invalid()
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    output[key] = descriptor.value
  }
  for (const key of requiredKeys) if (!Object.hasOwn(output, key)) invalid()
  return output
}

function exactArray(value: unknown, maximum: number): unknown[] {
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
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > maximum) invalid()
  const allowed = new Set<PropertyKey>(['length'])
  const output: unknown[] = []
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

function boundedString(value: unknown, maximum: number, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') > maximum ||
    (!allowEmpty && value.trim() === '') ||
    hasControlCharacter(value)
  ) {
    invalid()
  }
  return value.trim()
}

function safeProject(value: unknown): string {
  const project = boundedString(value, MAX_PROJECT_BYTES)
  if (
    SECRET_LIKE.test(project) ||
    PATH_LIKE.test(project) ||
    project.includes('/') ||
    project.includes('\\')
  ) {
    invalid()
  }
  return project
}

function safeTimestamp(value: unknown): string {
  const timestamp = boundedString(value, 32)
  if (!ISO_TIMESTAMP.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) invalid()
  return timestamp
}

function safeInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) invalid()
  return Number(value)
}

function validateRequest(value: unknown): PluginAiSessionsListRequest {
  const record = exactRecord(value, ['operation', 'query', 'limit'], ['operation'])
  if (record.operation !== 'list') invalid()
  const query = Object.hasOwn(record, 'query')
    ? boundedString(record.query, MAX_QUERY_BYTES, true)
    : undefined
  const limit = Object.hasOwn(record, 'limit') ? safeInteger(record.limit, MAX_LIMIT) : 50
  if (limit < 1) invalid()
  return Object.freeze({
    operation: 'list' as const,
    ...(query ? { query } : {}),
    limit
  })
}

function validateSession(value: unknown): PluginAiSessionMetadata {
  const record = exactRecord(
    value,
    ['id', 'platform', 'project', 'updatedAt', 'state', 'turnCount'],
    ['id', 'platform', 'project', 'updatedAt', 'state', 'turnCount']
  )
  const id = boundedString(record.id, 16)
  if (!SAFE_ID.test(id)) invalid()
  if (
    typeof record.platform !== 'string' ||
    !PLATFORMS.has(record.platform as PluginAiSessionsPlatform)
  )
    invalid()
  if (typeof record.state !== 'string' || !STATES.has(record.state as PluginAiSessionsState))
    invalid()
  return Object.freeze({
    id,
    platform: record.platform as PluginAiSessionsPlatform,
    project: safeProject(record.project),
    updatedAt: safeTimestamp(record.updatedAt),
    state: record.state as PluginAiSessionsState,
    turnCount: record.turnCount === null ? null : safeInteger(record.turnCount, MAX_TURNS)
  })
}

function validateResult(value: unknown): PluginAiSessionsSnapshot {
  const record = exactRecord(
    value,
    ['status', 'sessions', 'total', 'incomplete', 'reason'],
    ['status']
  )
  if (record.status === 'ready') {
    if (Object.hasOwn(record, 'reason')) invalid()
    const sessions = exactArray(record.sessions, MAX_LIMIT).map(validateSession)
    const total = safeInteger(record.total, MAX_TOTAL)
    if (total < sessions.length || typeof record.incomplete !== 'boolean') invalid()
    return Object.freeze({
      status: 'ready' as const,
      sessions: Object.freeze(sessions),
      total,
      incomplete: record.incomplete
    })
  }
  if (record.status === 'degraded' || record.status === 'unsupported') {
    if (Object.hasOwn(record, 'incomplete')) invalid()
    if (typeof record.reason !== 'string' || !REASONS.has(record.reason as PluginAiSessionsReason))
      invalid()
    const sessions = Object.hasOwn(record, 'sessions') ? exactArray(record.sessions, 0) : []
    const total = Object.hasOwn(record, 'total') ? safeInteger(record.total, 0) : 0
    if (sessions.length !== 0 || total !== 0) invalid()
    return Object.freeze({
      status: record.status,
      sessions: Object.freeze([]),
      total: 0 as const,
      reason: record.reason as PluginAiSessionsReason
    })
  }
  invalid()
}

function snapshotActivation(value: unknown): PluginActivationIdentity {
  const record = exactRecord(
    value,
    ['name', 'pluginInstanceId', 'activationGeneration', 'key'],
    ['name', 'pluginInstanceId', 'activationGeneration', 'key']
  )
  if (!Number.isSafeInteger(record.activationGeneration) || Number(record.activationGeneration) < 1)
    invalid()
  return Object.freeze({
    name: boundedString(record.name, 128),
    pluginInstanceId: boundedString(record.pluginInstanceId, 128),
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

function serviceMethod<T extends (...args: never[]) => unknown>(value: unknown, key: string): T {
  if (!value || typeof value !== 'object' || !TRUSTED_SERVICES.has(value)) invalid()
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor?.enumerable || !('value' in descriptor) || typeof descriptor.value !== 'function')
    invalid()
  return descriptor.value as T
}

export function createPluginAiSessionsCapabilities(
  rawOptions: PluginAiSessionsCapabilityOptions
): PluginAiSessionsCapabilities {
  const options = exactRecord(rawOptions, [
    'activation',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeIntelligence',
    'authorizeRead',
    'watchIntelligencePermissionRevoked',
    'watchReadPermissionRevoked',
    'service'
  ]) as unknown as PluginAiSessionsCapabilityOptions
  for (const key of [
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeIntelligence',
    'authorizeRead',
    'watchIntelligencePermissionRevoked',
    'watchReadPermissionRevoked'
  ] as const) {
    if (typeof options[key] !== 'function' || utilTypes.isProxy(options[key])) invalid()
  }
  const expected = snapshotActivation(options.activation)
  if (!isPrivilegedPluginFor('aiSessions', expected.name)) invalid()
  const list = serviceMethod<TrustedPluginAiSessionsService['list']>(options.service, 'list')
  const disposers: Array<() => void> = []
  const controllers = new Set<AbortController>()
  const operations = new Set<Promise<void>>()
  let closed = false
  let permissionsAvailable = true
  let closePromise: Promise<void> | null = null

  const abortAll = (): void => {
    for (const controller of controllers) controller.abort()
  }
  for (const watch of [
    options.watchIntelligencePermissionRevoked,
    options.watchReadPermissionRevoked
  ]) {
    try {
      const dispose = watch.call(rawOptions, expected.name, abortAll)
      if (typeof dispose !== 'function' || utilTypes.isProxy(dispose)) invalid()
      disposers.push(dispose)
    } catch {
      permissionsAvailable = false
    }
  }

  const assertAuthority = (context: PluginSecurityContext): void => {
    if (!isAuthoritativePluginContext(context)) invalid()
    const identity = context.identity
    if (
      identity.authority !== 'plugin-host' ||
      identity.pluginName !== expected.name ||
      context.name !== expected.name ||
      identity.pluginInstanceId !== expected.pluginInstanceId ||
      identity.activationGeneration !== expected.activationGeneration ||
      context.uniqueKey !== expected.key ||
      !Number.isSafeInteger(identity.hostGeneration)
    ) {
      invalid()
    }
    const current = options.resolveCurrentActivation.call(rawOptions, expected.name)
    if (
      !current ||
      !sameActivation(snapshotActivation(current), expected) ||
      options.resolveHostGeneration.call(rawOptions, expected) !== identity.hostGeneration
    ) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
  }

  const authorize = (callback: (pluginName: string) => boolean): void => {
    if (!permissionsAvailable) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    let decision: unknown
    try {
      decision = callback.call(rawOptions, expected.name)
    } catch {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    if (typeof decision !== 'boolean') {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    if (!decision) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
  }

  const definition: PluginHostCapabilityDefinition<
    PluginAiSessionsListRequest,
    PluginAiSessionsSnapshot
  > = Object.freeze({
    id: 'intelligence.sessions',
    permission: 'intelligence.basic',
    timeoutMs: 30_000,
    maxConcurrency: 2,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest,
    validateResult,
    invoke: async (
      context: PluginSecurityContext,
      request: PluginAiSessionsListRequest,
      signal: AbortSignal
    ) => {
      assertAuthority(context)
      authorize(options.authorizeIntelligence)
      authorize(options.authorizeRead)
      if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
      if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      const controller = new AbortController()
      const onAbort = (): void => controller.abort()
      signal.addEventListener('abort', onAbort, { once: true })
      controllers.add(controller)
      let finish!: () => void
      const active = new Promise<void>((resolve) => {
        finish = resolve
      })
      operations.add(active)
      try {
        const result = await Reflect.apply(list, options.service, [
          Object.freeze({
            ...(request.query ? { query: request.query } : {}),
            limit: request.limit
          }),
          controller.signal
        ])
        if (controller.signal.aborted) {
          throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
        }
        return validateResult(result)
      } finally {
        signal.removeEventListener('abort', onAbort)
        controllers.delete(controller)
        operations.delete(active)
        finish()
      }
    }
  })

  return Object.freeze({
    definitions: Object.freeze([definition]),
    close(): Promise<void> {
      if (closePromise) return closePromise
      closed = true
      abortAll()
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          // Authority is already closed.
        }
      }
      closePromise = Promise.allSettled([...operations]).then(() => undefined)
      return closePromise
    }
  })
}

function normalizeSource(value: unknown): PluginAiSessionSourceEntry | null {
  try {
    const record = exactRecord(
      value,
      ['platform', 'project', 'updatedAt', 'state', 'turnCount', 'sourceId'],
      ['platform', 'project', 'updatedAt', 'state', 'turnCount', 'sourceId']
    )
    if (
      typeof record.platform !== 'string' ||
      !PLATFORMS.has(record.platform as PluginAiSessionsPlatform)
    )
      return null
    if (typeof record.state !== 'string' || !STATES.has(record.state as PluginAiSessionsState))
      return null
    const sourceId = boundedString(record.sourceId, MAX_SOURCE_ID_BYTES)
    if (SECRET_LIKE.test(sourceId)) return null
    return Object.freeze({
      platform: record.platform as PluginAiSessionsPlatform,
      project: safeProject(record.project),
      updatedAt: safeTimestamp(record.updatedAt),
      state: record.state as PluginAiSessionsState,
      turnCount: record.turnCount === null ? null : safeInteger(record.turnCount, MAX_TURNS),
      sourceId
    })
  } catch {
    return null
  }
}

function sessionId(source: PluginAiSessionSourceEntry): string {
  return createHash('sha256')
    .update(source.platform)
    .update('\0')
    .update(source.sourceId)
    .digest('hex')
    .slice(0, 16)
}

export function createFixedPluginAiSessionsService(
  rawOptions: FixedPluginAiSessionsServiceOptions
): TrustedPluginAiSessionsService {
  const options = exactRecord(
    rawOptions,
    ['listMetadata'],
    ['listMetadata']
  ) as unknown as FixedPluginAiSessionsServiceOptions
  if (typeof options.listMetadata !== 'function' || utilTypes.isProxy(options.listMetadata))
    invalid()
  const service: TrustedPluginAiSessionsService = {
    async list(request, signal) {
      if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      let raw: PluginAiSessionSourceSnapshot
      try {
        raw = await options.listMetadata(signal)
      } catch {
        if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
        return Object.freeze({
          status: 'degraded' as const,
          sessions: Object.freeze([]),
          total: 0 as const,
          reason: 'index-unavailable' as const
        })
      }
      let values: unknown[]
      let sourceIncomplete: boolean
      try {
        const snapshot = exactRecord(raw, ['entries', 'incomplete'], ['entries', 'incomplete'])
        if (typeof snapshot.incomplete !== 'boolean') invalid()
        values = exactArray(snapshot.entries, MAX_SOURCE_ROWS)
        sourceIncomplete = snapshot.incomplete
      } catch {
        return Object.freeze({
          status: 'degraded' as const,
          sessions: Object.freeze([]),
          total: 0 as const,
          reason: 'scan-limited' as const
        })
      }
      const indexed = values
        .map(normalizeSource)
        .filter((entry): entry is PluginAiSessionSourceEntry => Boolean(entry))
        .map((entry) => Object.freeze({ entry, id: sessionId(entry) }))
      indexed.sort((left, right) => right.entry.updatedAt.localeCompare(left.entry.updatedAt))
      const query = request.query?.trim().toLowerCase() ?? ''
      const matched = query
        ? indexed.filter(({ entry, id }) =>
            `${id} ${entry.platform} ${entry.project} ${entry.state}`.toLowerCase().includes(query)
          )
        : indexed
      const sessions = matched.slice(0, request.limit).map(({ entry, id }) =>
        Object.freeze({
          id,
          platform: entry.platform,
          project: entry.project,
          updatedAt: entry.updatedAt,
          state: entry.state,
          turnCount: entry.turnCount
        })
      )
      return Object.freeze({
        status: 'ready' as const,
        sessions: Object.freeze(sessions),
        total: matched.length,
        incomplete: sourceIncomplete || matched.length > sessions.length
      })
    }
  }
  Object.freeze(service)
  TRUSTED_SERVICES.add(service)
  return service
}
