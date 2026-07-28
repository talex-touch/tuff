import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { isIP } from 'node:net'
import { types as utilTypes } from 'node:util'
import type { PluginHostCapabilityDefinition } from './plugin-host-capabilities'

export const PLUGIN_CHANNEL_OPERATION_IDS = Object.freeze([
  'auth.session.get-state',
  'snippets.cloud.list',
  'snippets.cloud.publish',
  'snippets.cloud.download',
  'snippets.cloud.install'
] as const)

export const PLUGIN_QUICK_OPS_OPERATION_IDS = Object.freeze([
  'capabilities.get',
  'sessions.get',
  'audit.get',
  'system-info.get',
  'tuff-diagnostics.get',
  'disk-space.get',
  'directory-usage.get',
  'query-local-ip.get',
  'port-status.get',
  'dns-query.get',
  'file-hash.get',
  'file-base64.get',
  'recent-download.get',
  'common-directory.get',
  'path-format.get',
  'format-text.get',
  'network-status.get',
  'battery-status.get',
  'system-proxy.get',
  'developer-preview.get',
  'developer-preview.save'
] as const)

export const PLUGIN_FLOW_OPERATION_IDS = Object.freeze(['quickops.dispatch'] as const)

export const PLUGIN_QUICK_OPS_FLOW_TARGET_IDS = Object.freeze([
  'quickops.stop-all-sessions',
  'quickops.stop-system-awake',
  'quickops.stop-keep-awake',
  'quickops.stop-clean-screen',
  'quickops.pause-timer',
  'quickops.resume-timer',
  'quickops.stop-timer',
  'quickops.pause-pomodoro',
  'quickops.resume-pomodoro',
  'quickops.stop-pomodoro',
  'quickops.pause-stopwatch',
  'quickops.resume-stopwatch',
  'quickops.lap-stopwatch',
  'quickops.reset-stopwatch'
] as const)

export type PluginChannelOperationId = (typeof PLUGIN_CHANNEL_OPERATION_IDS)[number]
export type PluginQuickOpsOperationId = (typeof PLUGIN_QUICK_OPS_OPERATION_IDS)[number]
export type PluginFlowOperationId = (typeof PLUGIN_FLOW_OPERATION_IDS)[number]

export interface PluginHostNexusRequest {
  readonly method: 'GET' | 'POST'
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body?: unknown
  readonly signal: AbortSignal
  readonly maxResponseBytes: number
  readonly resolvedAddresses: readonly string[]
}

interface PluginHostNexusResponse {
  readonly status: number
  readonly statusText: string
  readonly headers: Readonly<Record<string, string>>
  readonly data: unknown
  readonly url: string
  readonly ok: boolean
}

export interface PluginHostNexusService {
  listSnippets(request: { readonly limit: number }, signal: AbortSignal): Promise<unknown>
  publishSnippets(
    request: { readonly pack: SnippetPackDto; readonly visibility: 'public' | 'unlisted' },
    signal: AbortSignal
  ): Promise<unknown>
  downloadSnippet(packageId: string, signal: AbortSignal): Promise<unknown>
  installSnippet(packageId: string, signal: AbortSignal): Promise<unknown>
}

export interface PluginHostNexusServiceOptions {
  getBaseUrl(): string
  getCredential(): string | null | undefined
  resolveAddresses(hostname: string): Promise<readonly string[]>
  requestPinned(request: PluginHostNexusRequest): Promise<PluginHostNexusResponse>
}

export interface PluginRequestReplyCapabilityOptions {
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authState(): unknown
  nexus: PluginHostNexusService
  quickOps: {
    invoke(
      operation: PluginQuickOpsOperationId,
      payload: unknown,
      signal: AbortSignal
    ): unknown | Promise<unknown>
  }
  flow: {
    dispatch(
      senderId: string,
      payload: unknown,
      options: unknown,
      signal: AbortSignal
    ): unknown | Promise<unknown>
  }
}

export interface PluginRequestReplyCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
}

interface SnippetDto {
  readonly id: string
  readonly type: 'text' | 'code' | 'prompt' | 'template'
  readonly title: string
  readonly language: string
  readonly tags: readonly string[]
  readonly content: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly lastUsedAt?: number
  readonly useCount: number
}

interface SnippetPackDto {
  readonly format: 'tuff.snippet-pack+json'
  readonly version: number
  readonly title: string
  readonly summary: string
  readonly pluginId: 'touch-snippets'
  readonly kind: 'snippet-pack'
  readonly schemaVersion: number
  readonly createdAt: number
  readonly snippets: readonly SnippetDto[]
  readonly skippedSensitiveCount: number
}

interface InvocationEnvelope<Operation extends string = string> {
  readonly operation: Operation
  readonly payload: unknown
}

const MAX_IDENTIFIER_BYTES = 256
const MAX_TEXT_BYTES = 64 * 1024
const MAX_PACK_BYTES = 512 * 1024
const MAX_RESULT_BYTES = 768 * 1024
const MAX_DTO_DEPTH = 20
const MAX_DTO_MEMBERS = 5_000
const MAX_SNIPPETS = 500
const MAX_TAGS = 32
const MAX_ADDRESSES = 16
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor', '__tuffHostWire'])
const SENSITIVE_CONTENT_PATTERNS = [
  /(?:api[_-]?key|secret|password|passwd|token|private[_-]?key)\s*[:=]/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  /\bsk-[\w-]{20,}\b/,
  /\bghp_\w{20,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/
]
const CHANNEL_OPERATIONS = new Set<string>(PLUGIN_CHANNEL_OPERATION_IDS)
const QUICK_OPS_OPERATIONS = new Set<string>(PLUGIN_QUICK_OPS_OPERATION_IDS)
const FLOW_OPERATIONS = new Set<string>(PLUGIN_FLOW_OPERATION_IDS)
const QUICK_OPS_FLOW_TARGETS = new Set<string>(PLUGIN_QUICK_OPS_FLOW_TARGET_IDS)
const SNIPPET_TYPES = new Set<string>(['text', 'code', 'prompt', 'template'])
const FLOW_STATES = new Set<string>([
  'INIT',
  'TARGET_SELECTING',
  'TARGET_SELECTED',
  'DELIVERING',
  'DELIVERED',
  'PROCESSING',
  'ACKED',
  'FAILED',
  'CANCELLED'
])

function invalid(): never {
  throw new Error('PLUGIN_HOST_OPERATION_INVALID')
}

function unavailable(): never {
  throw new Error('PLUGIN_HOST_OPERATION_UNAVAILABLE')
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function boundedString(value: unknown, maximumBytes: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) invalid()
  if (utf8Bytes(value) > maximumBytes) invalid()
  return value
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) invalid()
  return Number(value)
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
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
  const allowed = new Set(keys)
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key) || FORBIDDEN_KEYS.has(key)) invalid()
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    output[key] = descriptor.value
  }
  return output
}

function required(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) invalid()
  return record[key]
}

function snapshotArray(value: unknown, maximum: number): unknown[] {
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

function cloneDto(value: unknown, maximumBytes = MAX_RESULT_BYTES): unknown {
  const ancestors = new WeakSet<object>()
  let members = 0
  const clone = (input: unknown, depth: number): unknown => {
    if (depth > MAX_DTO_DEPTH) invalid()
    if (input === null || typeof input === 'boolean' || typeof input === 'string') {
      if (typeof input === 'string') boundedString(input, MAX_TEXT_BYTES, true)
      return input
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) invalid()
      return input
    }
    if (!input || typeof input !== 'object' || utilTypes.isProxy(input)) invalid()
    if (ancestors.has(input)) invalid()
    ancestors.add(input)
    try {
      if (Array.isArray(input)) {
        const values = snapshotArray(input, MAX_DTO_MEMBERS - members)
        members += values.length
        if (members > MAX_DTO_MEMBERS) invalid()
        return values.map((entry) => clone(entry, depth + 1))
      }
      const record = exactRecord(
        input,
        Reflect.ownKeys(input).filter((key): key is string => typeof key === 'string')
      )
      const output: Record<string, unknown> = Object.create(null)
      for (const [key, entry] of Object.entries(record)) {
        members += 1
        if (members > MAX_DTO_MEMBERS || FORBIDDEN_KEYS.has(key)) invalid()
        output[key] = clone(entry, depth + 1)
      }
      return output
    } finally {
      ancestors.delete(input)
    }
  }
  const output = clone(value, 0)
  let serialized: string
  try {
    serialized = JSON.stringify(output)
  } catch {
    invalid()
  }
  if (utf8Bytes(serialized) > maximumBytes) invalid()
  return output
}

function readMethod(input: unknown, key: string): (...args: unknown[]) => unknown {
  const record = exactRecord(
    input,
    Reflect.ownKeys(input as object).filter((entry): entry is string => typeof entry === 'string')
  )
  const method = required(record, key)
  if (typeof method !== 'function' || utilTypes.isProxy(method)) invalid()
  return method as (...args: unknown[]) => unknown
}

function snapshotActivation(input: unknown): PluginActivationIdentity {
  const record = exactRecord(input, ['name', 'pluginInstanceId', 'activationGeneration', 'key'])
  return Object.freeze({
    name: boundedString(required(record, 'name'), MAX_IDENTIFIER_BYTES),
    pluginInstanceId: boundedString(required(record, 'pluginInstanceId'), MAX_IDENTIFIER_BYTES),
    activationGeneration: boundedInteger(
      required(record, 'activationGeneration'),
      1,
      Number.MAX_SAFE_INTEGER
    ),
    key: boundedString(required(record, 'key'), MAX_IDENTIFIER_BYTES)
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

function validateSnippet(value: unknown): SnippetDto {
  const record = exactRecord(value, [
    'id',
    'type',
    'title',
    'language',
    'tags',
    'content',
    'createdAt',
    'updatedAt',
    'lastUsedAt',
    'useCount'
  ])
  const type = boundedString(required(record, 'type'), 32)
  if (!SNIPPET_TYPES.has(type)) invalid()
  const tags = snapshotArray(required(record, 'tags'), MAX_TAGS).map((tag) =>
    boundedString(tag, 256)
  )
  const snippet: SnippetDto = {
    id: boundedString(required(record, 'id'), MAX_IDENTIFIER_BYTES),
    type: type as SnippetDto['type'],
    title: boundedString(required(record, 'title'), 4_096),
    language: boundedString(required(record, 'language'), 256, true),
    tags: Object.freeze(tags),
    content: boundedString(required(record, 'content'), MAX_TEXT_BYTES, true),
    createdAt: boundedInteger(required(record, 'createdAt'), 0, Number.MAX_SAFE_INTEGER),
    updatedAt: boundedInteger(required(record, 'updatedAt'), 0, Number.MAX_SAFE_INTEGER),
    ...(Object.hasOwn(record, 'lastUsedAt')
      ? { lastUsedAt: boundedInteger(record.lastUsedAt, 0, Number.MAX_SAFE_INTEGER) }
      : {}),
    useCount: boundedInteger(required(record, 'useCount'), 0, Number.MAX_SAFE_INTEGER)
  }
  const sensitiveText = [snippet.title, snippet.language, snippet.content, ...snippet.tags].join(
    '\n'
  )
  if (SENSITIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(sensitiveText))) invalid()
  return Object.freeze(snippet)
}

function validateSnippetPack(value: unknown): SnippetPackDto {
  const record = exactRecord(value, [
    'format',
    'version',
    'title',
    'summary',
    'pluginId',
    'kind',
    'schemaVersion',
    'createdAt',
    'snippets',
    'skippedSensitiveCount'
  ])
  if (
    required(record, 'format') !== 'tuff.snippet-pack+json' ||
    required(record, 'pluginId') !== 'touch-snippets' ||
    required(record, 'kind') !== 'snippet-pack'
  ) {
    invalid()
  }
  const output: SnippetPackDto = {
    format: 'tuff.snippet-pack+json',
    version: boundedInteger(required(record, 'version'), 1, 100),
    title: boundedString(required(record, 'title'), 4_096),
    summary: boundedString(required(record, 'summary'), 16 * 1024, true),
    pluginId: 'touch-snippets',
    kind: 'snippet-pack',
    schemaVersion: boundedInteger(required(record, 'schemaVersion'), 1, 100),
    createdAt: boundedInteger(required(record, 'createdAt'), 0, Number.MAX_SAFE_INTEGER),
    snippets: Object.freeze(
      snapshotArray(required(record, 'snippets'), MAX_SNIPPETS).map(validateSnippet)
    ),
    skippedSensitiveCount: boundedInteger(
      required(record, 'skippedSensitiveCount'),
      0,
      MAX_SNIPPETS
    )
  }
  if (utf8Bytes(JSON.stringify(output)) > MAX_PACK_BYTES) invalid()
  return Object.freeze(output)
}

function validatePackageId(value: unknown): string {
  const id = boundedString(value, MAX_IDENTIFIER_BYTES)
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) invalid()
  return id
}

function validateInvocationEnvelope(
  value: unknown,
  operations: ReadonlySet<string>
): InvocationEnvelope {
  const record = exactRecord(value, ['operation', 'payload'])
  const operation = boundedString(required(record, 'operation'), 128)
  if (!operations.has(operation)) invalid()
  return Object.freeze({ operation, payload: required(record, 'payload') })
}

function validateChannelRequest(value: unknown): InvocationEnvelope<PluginChannelOperationId> {
  const envelope = validateInvocationEnvelope(value, CHANNEL_OPERATIONS)
  let payload: unknown
  switch (envelope.operation as PluginChannelOperationId) {
    case 'auth.session.get-state':
      if (envelope.payload !== null) invalid()
      payload = null
      break
    case 'snippets.cloud.list': {
      const record = exactRecord(envelope.payload, ['limit'])
      payload = Object.freeze({
        limit: Object.hasOwn(record, 'limit') ? boundedInteger(record.limit, 1, 50) : 10
      })
      break
    }
    case 'snippets.cloud.publish': {
      const record = exactRecord(envelope.payload, ['pack', 'visibility'])
      const visibility = Object.hasOwn(record, 'visibility') ? record.visibility : 'public'
      if (visibility !== 'public' && visibility !== 'unlisted') invalid()
      payload = Object.freeze({
        pack: validateSnippetPack(required(record, 'pack')),
        visibility
      })
      break
    }
    case 'snippets.cloud.download':
    case 'snippets.cloud.install': {
      const record = exactRecord(envelope.payload, ['packageId'])
      payload = Object.freeze({ packageId: validatePackageId(required(record, 'packageId')) })
      break
    }
  }
  return Object.freeze({
    operation: envelope.operation as PluginChannelOperationId,
    payload
  })
}

function validateAuthState(value: unknown): unknown {
  const record = exactRecord(value, ['isLoaded', 'isSignedIn', 'user'])
  if (
    typeof required(record, 'isLoaded') !== 'boolean' ||
    typeof required(record, 'isSignedIn') !== 'boolean'
  ) {
    invalid()
  }
  let user: unknown = null
  if (record.user !== null) {
    const userRecord = exactRecord(record.user, ['id', 'name', 'avatar'])
    user = Object.freeze({
      id: boundedString(required(userRecord, 'id'), MAX_IDENTIFIER_BYTES),
      ...(Object.hasOwn(userRecord, 'name') && userRecord.name !== null
        ? { name: boundedString(userRecord.name, 4_096, true) }
        : {}),
      ...(Object.hasOwn(userRecord, 'avatar') && userRecord.avatar !== null
        ? { avatar: boundedString(userRecord.avatar, 16 * 1024, true) }
        : {})
    })
  }
  return Object.freeze({
    isLoaded: record.isLoaded,
    isSignedIn: record.isSignedIn,
    user
  })
}

function validateSnippetPackage(value: unknown): unknown {
  const record = exactRecord(value, [
    'id',
    'pluginId',
    'kind',
    'title',
    'summary',
    'schemaVersion',
    'visibility',
    'manifest',
    'contentRef',
    'contentInline',
    'createdBy',
    'status',
    'installCount',
    'createdAt',
    'updatedAt',
    'publishedAt'
  ])
  if (
    required(record, 'pluginId') !== 'touch-snippets' ||
    required(record, 'kind') !== 'snippet-pack'
  ) {
    invalid()
  }
  const manifest = exactRecord(required(record, 'manifest'), [
    'importTarget',
    'format',
    'minPluginVersion'
  ])
  if (
    required(manifest, 'importTarget') !== 'touch-snippets' ||
    required(manifest, 'format') !== 'tuff.snippet-pack+json'
  ) {
    invalid()
  }
  const visibility = required(record, 'visibility')
  if (!['private', 'unlisted', 'team', 'public'].includes(String(visibility))) invalid()
  const status = required(record, 'status')
  if (!['draft', 'pending', 'published', 'rejected'].includes(String(status))) invalid()
  const output = {
    id: validatePackageId(required(record, 'id')),
    pluginId: 'touch-snippets',
    kind: 'snippet-pack',
    title: boundedString(required(record, 'title'), 4_096),
    ...(Object.hasOwn(record, 'summary')
      ? { summary: record.summary === null ? null : boundedString(record.summary, 16 * 1024, true) }
      : {}),
    schemaVersion: boundedInteger(required(record, 'schemaVersion'), 1, 100),
    visibility,
    manifest: Object.freeze({
      importTarget: 'touch-snippets',
      format: 'tuff.snippet-pack+json',
      ...(Object.hasOwn(manifest, 'minPluginVersion')
        ? { minPluginVersion: boundedString(manifest.minPluginVersion, 128) }
        : {})
    }),
    ...(Object.hasOwn(record, 'contentRef')
      ? { contentRef: record.contentRef === null ? null : boundedString(record.contentRef, 4_096) }
      : {}),
    ...(Object.hasOwn(record, 'contentInline')
      ? { contentInline: validateSnippetPack(record.contentInline) }
      : {}),
    createdBy: boundedString(required(record, 'createdBy'), MAX_IDENTIFIER_BYTES),
    status,
    installCount: boundedInteger(required(record, 'installCount'), 0, Number.MAX_SAFE_INTEGER),
    createdAt: boundedString(required(record, 'createdAt'), 128),
    updatedAt: boundedString(required(record, 'updatedAt'), 128),
    ...(Object.hasOwn(record, 'publishedAt')
      ? {
          publishedAt:
            record.publishedAt === null ? null : boundedString(record.publishedAt, 128, true)
        }
      : {})
  }
  if (utf8Bytes(JSON.stringify(output)) > MAX_RESULT_BYTES) invalid()
  return Object.freeze(output)
}

function validateChannelResult(value: unknown): unknown {
  const envelope = validateInvocationEnvelope(value, CHANNEL_OPERATIONS)
  let data: unknown
  switch (envelope.operation as PluginChannelOperationId) {
    case 'auth.session.get-state':
      data = validateAuthState(envelope.payload)
      break
    case 'snippets.cloud.list': {
      const record = exactRecord(envelope.payload, ['packages', 'total', 'limit', 'offset'])
      data = Object.freeze({
        packages: Object.freeze(
          snapshotArray(required(record, 'packages'), 50).map(validateSnippetPackage)
        ),
        total: boundedInteger(required(record, 'total'), 0, Number.MAX_SAFE_INTEGER),
        limit: boundedInteger(required(record, 'limit'), 1, 50),
        offset: boundedInteger(required(record, 'offset'), 0, Number.MAX_SAFE_INTEGER)
      })
      break
    }
    case 'snippets.cloud.publish':
    case 'snippets.cloud.download': {
      const record = exactRecord(envelope.payload, ['package'])
      data = Object.freeze({ package: validateSnippetPackage(required(record, 'package')) })
      break
    }
    case 'snippets.cloud.install': {
      const record = exactRecord(envelope.payload, ['package', 'installed'])
      if (required(record, 'installed') !== true) invalid()
      data = Object.freeze({
        package: validateSnippetPackage(required(record, 'package')),
        installed: true
      })
      break
    }
  }
  return Object.freeze({ operation: envelope.operation, data })
}

function validateNull(value: unknown): null {
  if (value !== null) invalid()
  return null
}

function validateOptionalTextRequest(
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> {
  const record = exactRecord(value, keys)
  const output: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) continue
    const entry = record[key]
    if (entry === undefined) continue
    if (key === 'port') output[key] = boundedInteger(entry, 1, 65_535)
    else if (key === 'deep') {
      if (typeof entry !== 'boolean') invalid()
      output[key] = entry
    } else output[key] = boundedString(entry, key === 'text' ? MAX_TEXT_BYTES : 4_096, true)
  }
  return Object.freeze(output)
}

function validateQuickOpsPayload(operation: PluginQuickOpsOperationId, value: unknown): unknown {
  switch (operation) {
    case 'capabilities.get':
    case 'sessions.get':
    case 'system-info.get':
    case 'tuff-diagnostics.get':
    case 'disk-space.get':
    case 'query-local-ip.get':
    case 'recent-download.get':
    case 'network-status.get':
    case 'battery-status.get':
    case 'system-proxy.get':
      return validateNull(value)
    case 'audit.get': {
      const record = exactRecord(value, ['limit'])
      return Object.freeze({
        ...(Object.hasOwn(record, 'limit') ? { limit: boundedInteger(record.limit, 1, 100) } : {})
      })
    }
    case 'directory-usage.get':
      return validateOptionalTextRequest(value, ['deep'])
    case 'port-status.get':
      return validateOptionalTextRequest(value, ['port', 'text'])
    case 'dns-query.get':
      return validateOptionalTextRequest(value, ['hostname', 'text', 'deep'])
    case 'file-hash.get':
    case 'file-base64.get':
    case 'path-format.get':
      return validateOptionalTextRequest(value, ['path', 'text'])
    case 'common-directory.get':
      return validateOptionalTextRequest(value, ['query', 'text'])
    case 'format-text.get': {
      const record = exactRecord(value, ['mode', 'text'])
      const mode = boundedString(required(record, 'mode'), 32)
      if (!['upper', 'lower', 'camel', 'snake', 'kebab'].includes(mode)) invalid()
      return Object.freeze({
        mode,
        text: boundedString(required(record, 'text'), MAX_TEXT_BYTES, true)
      })
    }
    case 'developer-preview.get': {
      const record = exactRecord(value, ['query'])
      const query = exactRecord(required(record, 'query'), ['text', 'inputs'])
      const inputs = Object.hasOwn(query, 'inputs')
        ? snapshotArray(query.inputs, 16).map((entry) => {
            const input = exactRecord(entry, ['type', 'content'])
            return Object.freeze({
              type: boundedString(required(input, 'type'), 64),
              content: boundedString(required(input, 'content'), MAX_TEXT_BYTES, true)
            })
          })
        : []
      return Object.freeze({
        query: Object.freeze({
          text: boundedString(required(query, 'text'), MAX_TEXT_BYTES, true),
          inputs: Object.freeze(inputs)
        })
      })
    }
    case 'developer-preview.save': {
      const record = exactRecord(value, ['format', 'payload'])
      const format = required(record, 'format')
      if (format !== 'svg' && format !== 'png') invalid()
      return Object.freeze({
        format,
        payload: cloneDto(required(record, 'payload'), MAX_PACK_BYTES)
      })
    }
  }
}

function validateQuickOpsRequest(value: unknown): InvocationEnvelope<PluginQuickOpsOperationId> {
  const envelope = validateInvocationEnvelope(value, QUICK_OPS_OPERATIONS)
  const operation = envelope.operation as PluginQuickOpsOperationId
  return Object.freeze({ operation, payload: validateQuickOpsPayload(operation, envelope.payload) })
}

function validateQuickOpsResult(value: unknown): unknown {
  const envelope = validateInvocationEnvelope(value, QUICK_OPS_OPERATIONS)
  return Object.freeze({ operation: envelope.operation, data: cloneDto(envelope.payload) })
}

function validateFlowRequest(value: unknown): InvocationEnvelope<PluginFlowOperationId> {
  const envelope = validateInvocationEnvelope(value, FLOW_OPERATIONS)
  const request = exactRecord(envelope.payload, ['payload', 'options'])
  const rawPayload = exactRecord(required(request, 'payload'), [
    'type',
    'data',
    'mimeType',
    'context'
  ])
  if (required(rawPayload, 'type') !== 'json') invalid()
  const data = exactRecord(required(rawPayload, 'data'), [
    'action',
    'targetId',
    'cleanup',
    'statefulRuntime'
  ])
  const targetId = boundedString(required(data, 'targetId'), MAX_IDENTIFIER_BYTES)
  if (!QUICK_OPS_FLOW_TARGETS.has(targetId)) invalid()
  const action = boundedString(required(data, 'action'), 128)
  if (targetId !== `quickops.${action}`) invalid()
  if (
    typeof required(data, 'cleanup') !== 'boolean' ||
    required(data, 'statefulRuntime') !== true
  ) {
    invalid()
  }
  const context = exactRecord(required(rawPayload, 'context'), ['sourcePluginId'])
  boundedString(required(context, 'sourcePluginId'), MAX_IDENTIFIER_BYTES)
  const rawOptions = exactRecord(required(request, 'options'), [
    'preferredTarget',
    'skipSelector',
    'requireAck',
    'timeout'
  ])
  if (
    required(rawOptions, 'preferredTarget') !== targetId ||
    required(rawOptions, 'skipSelector') !== true ||
    required(rawOptions, 'requireAck') !== true
  ) {
    invalid()
  }
  const payload = Object.freeze({
    type: 'json',
    data: Object.freeze({
      action,
      targetId,
      cleanup: data.cleanup,
      statefulRuntime: true
    }),
    context: Object.freeze({ sourcePluginId: '' })
  })
  const options = Object.freeze({
    preferredTarget: targetId,
    skipSelector: true,
    requireAck: true,
    ...(Object.hasOwn(rawOptions, 'timeout')
      ? { timeout: boundedInteger(rawOptions.timeout, 100, 30_000) }
      : {})
  })
  return Object.freeze({
    operation: envelope.operation as PluginFlowOperationId,
    payload: Object.freeze({ payload, options })
  })
}

function validateFlowResult(value: unknown): unknown {
  const envelope = validateInvocationEnvelope(value, FLOW_OPERATIONS)
  const result = exactRecord(envelope.payload, ['sessionId', 'state', 'ackPayload', 'error'])
  const state = boundedString(required(result, 'state'), 64)
  if (!FLOW_STATES.has(state)) invalid()
  const data = {
    sessionId: boundedString(
      required(result, 'sessionId'),
      MAX_IDENTIFIER_BYTES,
      state === 'FAILED'
    ),
    state,
    ...(Object.hasOwn(result, 'ackPayload')
      ? { ackPayload: cloneDto(result.ackPayload, MAX_PACK_BYTES) }
      : {}),
    ...(Object.hasOwn(result, 'error') && result.error
      ? {
          error: (() => {
            const error = exactRecord(result.error, ['code', 'message', 'details'])
            return Object.freeze({
              code: boundedString(required(error, 'code'), 128)
            })
          })()
        }
      : {})
  }
  return Object.freeze({ operation: envelope.operation, data: Object.freeze(data) })
}

function freezeDefinition(
  definition: PluginHostCapabilityDefinition
): PluginHostCapabilityDefinition {
  return Object.freeze(definition)
}

function snapshotNexusResponse(value: unknown, expectedUrl: string): unknown {
  const response = exactRecord(value, ['status', 'statusText', 'headers', 'data', 'url', 'ok'])
  const status = boundedInteger(required(response, 'status'), 100, 599)
  if (response.url !== expectedUrl || response.ok !== true || status < 200 || status >= 300)
    unavailable()
  return cloneDto(required(response, 'data'), MAX_RESULT_BYTES)
}

export function createPluginHostNexusService(
  rawOptions: PluginHostNexusServiceOptions
): PluginHostNexusService {
  const options = exactRecord(rawOptions, [
    'getBaseUrl',
    'getCredential',
    'resolveAddresses',
    'requestPinned'
  ])
  const getBaseUrl = readMethod(options, 'getBaseUrl')
  const getCredential = readMethod(options, 'getCredential')
  const resolveAddresses = readMethod(options, 'resolveAddresses')
  const requestPinned = readMethod(options, 'requestPinned')

  const request = async (
    path: string,
    init: { method: 'GET' | 'POST'; authenticated: boolean; body?: unknown },
    signal: AbortSignal
  ): Promise<unknown> => {
    if (signal.aborted) unavailable()
    let base: URL
    let target: URL
    try {
      base = new URL(String(getBaseUrl.call(rawOptions)))
      target = new URL(path, base)
    } catch {
      unavailable()
    }
    if (
      (base.protocol !== 'http:' && base.protocol !== 'https:') ||
      base.username ||
      base.password ||
      target.origin !== base.origin ||
      target.username ||
      target.password
    ) {
      unavailable()
    }
    let addressValues: unknown
    try {
      addressValues = await resolveAddresses.call(rawOptions, target.hostname)
    } catch {
      unavailable()
    }
    const addresses = snapshotArray(addressValues, MAX_ADDRESSES).map((address) => {
      const value = boundedString(address, MAX_IDENTIFIER_BYTES)
      if (!isIP(value)) unavailable()
      return value
    })
    if (addresses.length === 0) unavailable()
    const headers: Record<string, string> = Object.create(null)
    if (init.authenticated) {
      const credential = getCredential.call(rawOptions)
      const token = typeof credential === 'string' ? credential.trim() : ''
      if (!token || utf8Bytes(token) > 16 * 1024) unavailable()
      headers.authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`
    }
    if (Object.hasOwn(init, 'body')) headers['content-type'] = 'application/json'
    const requestValue: PluginHostNexusRequest = Object.freeze({
      method: init.method,
      url: target.toString(),
      headers: Object.freeze(headers),
      ...(Object.hasOwn(init, 'body') ? { body: cloneDto(init.body, MAX_PACK_BYTES) } : {}),
      signal,
      maxResponseBytes: MAX_RESULT_BYTES,
      resolvedAddresses: Object.freeze(addresses)
    })
    const response = await requestPinned.call(rawOptions, requestValue)
    if (signal.aborted) unavailable()
    return snapshotNexusResponse(response, target.toString())
  }

  return Object.freeze({
    listSnippets: async ({ limit }: { readonly limit: number }, signal: AbortSignal) =>
      await request(
        `/api/store/plugin-content?pluginId=touch-snippets&kind=snippet-pack&limit=${limit}`,
        { method: 'GET', authenticated: false },
        signal
      ),
    publishSnippets: async (
      input: { readonly pack: SnippetPackDto; readonly visibility: 'public' | 'unlisted' },
      signal: AbortSignal
    ) =>
      await request(
        '/api/store/plugin-content',
        {
          method: 'POST',
          authenticated: true,
          body: {
            pluginId: 'touch-snippets',
            kind: 'snippet-pack',
            title: input.pack.title,
            summary: input.pack.summary,
            schemaVersion: 1,
            visibility: input.visibility,
            manifest: {
              importTarget: 'touch-snippets',
              format: 'tuff.snippet-pack+json'
            },
            contentInline: input.pack
          }
        },
        signal
      ),
    downloadSnippet: async (packageId: string, signal: AbortSignal) =>
      await request(
        `/api/store/plugin-content/${encodeURIComponent(packageId)}`,
        { method: 'GET', authenticated: false },
        signal
      ),
    installSnippet: async (packageId: string, signal: AbortSignal) =>
      await request(
        `/api/store/plugin-content/${encodeURIComponent(packageId)}/install`,
        { method: 'POST', authenticated: false },
        signal
      )
  })
}

export function createPluginRequestReplyCapabilities(
  rawOptions: PluginRequestReplyCapabilityOptions
): PluginRequestReplyCapabilities {
  const options = exactRecord(rawOptions, [
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authState',
    'nexus',
    'quickOps',
    'flow'
  ])
  const resolveCurrentActivation = readMethod(options, 'resolveCurrentActivation')
  const resolveHostGeneration = readMethod(options, 'resolveHostGeneration')
  const authState = readMethod(options, 'authState')
  const nexus = required(options, 'nexus')
  const listSnippets = readMethod(nexus, 'listSnippets')
  const publishSnippets = readMethod(nexus, 'publishSnippets')
  const downloadSnippet = readMethod(nexus, 'downloadSnippet')
  const installSnippet = readMethod(nexus, 'installSnippet')
  const quickOps = required(options, 'quickOps')
  const quickOpsInvoke = readMethod(quickOps, 'invoke')
  const flow = required(options, 'flow')
  const flowDispatch = readMethod(flow, 'dispatch')

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
    let current: PluginActivationIdentity
    let hostGeneration: unknown
    try {
      current = snapshotActivation(resolveCurrentActivation.call(rawOptions, identity.pluginName))
      hostGeneration = resolveHostGeneration.call(rawOptions, current)
    } catch {
      invalid()
    }
    if (
      !sameActivation(current, {
        name: identity.pluginName,
        pluginInstanceId: identity.pluginInstanceId,
        activationGeneration: identity.activationGeneration,
        key: context.uniqueKey
      }) ||
      hostGeneration !== identity.hostGeneration
    ) {
      invalid()
    }
    return current
  }

  const definitions: PluginHostCapabilityDefinition[] = [
    freezeDefinition({
      id: 'channel.invoke',
      permission: 'network.internet',
      timeoutMs: 30_000,
      maxConcurrency: 8,
      validateRequest: validateChannelRequest,
      validateResult: validateChannelResult,
      async invoke(context, request, signal) {
        assertAuthority(context)
        const envelope = request as ReturnType<typeof validateChannelRequest>
        let data: unknown
        switch (envelope.operation) {
          case 'auth.session.get-state':
            data = authState.call(rawOptions)
            break
          case 'snippets.cloud.list':
            data = await listSnippets.call(nexus, envelope.payload, signal)
            break
          case 'snippets.cloud.publish':
            data = await publishSnippets.call(nexus, envelope.payload, signal)
            break
          case 'snippets.cloud.download':
            data = await downloadSnippet.call(
              nexus,
              (envelope.payload as { packageId: string }).packageId,
              signal
            )
            break
          case 'snippets.cloud.install':
            data = await installSnippet.call(
              nexus,
              (envelope.payload as { packageId: string }).packageId,
              signal
            )
            break
        }
        return { operation: envelope.operation, payload: data }
      }
    }),
    freezeDefinition({
      id: 'quick-ops.invoke',
      timeoutMs: 30_000,
      maxConcurrency: 8,
      validateRequest: validateQuickOpsRequest,
      validateResult: validateQuickOpsResult,
      async invoke(context, request, signal) {
        assertAuthority(context)
        const envelope = request as ReturnType<typeof validateQuickOpsRequest>
        const data = await quickOpsInvoke.call(
          quickOps,
          envelope.operation,
          envelope.payload,
          signal
        )
        return { operation: envelope.operation, payload: data }
      }
    }),
    freezeDefinition({
      id: 'flow.invoke',
      permission: 'storage.shared',
      timeoutMs: 30_000,
      maxConcurrency: 4,
      validateRequest: validateFlowRequest,
      validateResult: validateFlowResult,
      async invoke(context, request, signal) {
        const activation = assertAuthority(context)
        const envelope = request as ReturnType<typeof validateFlowRequest>
        const requestPayload = envelope.payload as {
          payload: { context: { sourcePluginId: string } }
          options: unknown
        }
        const payload = {
          ...requestPayload.payload,
          context: { sourcePluginId: activation.name }
        }
        const data = await flowDispatch.call(
          flow,
          activation.name,
          payload,
          requestPayload.options,
          signal
        )
        return { operation: envelope.operation, payload: data }
      }
    })
  ]

  return Object.freeze({ definitions: Object.freeze(definitions) })
}
