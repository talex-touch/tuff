import { constants, type Stats } from 'node:fs'
import fsp, { type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { types as utilTypes } from 'node:util'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'
import { isPrivilegedPluginFor } from '../privileged-plugins'
import { hasControlCharacter } from './plugin-host-text-validation'

export interface PluginHostsEntry {
  readonly hostname: string
  readonly addresses: readonly string[]
  readonly comment?: string
}

export type PluginHostsSnapshot =
  | {
      readonly status: 'ready'
      readonly revision: string
      readonly entries: readonly PluginHostsEntry[]
    }
  | {
      readonly status: 'degraded' | 'unsupported'
      readonly reason: PluginHostsReason
      readonly entries: readonly PluginHostsEntry[]
    }

export type PluginHostsReason =
  | 'permission-denied'
  | 'permission-unavailable'
  | 'path-unsupported'
  | 'file-missing'
  | 'file-invalid'
  | 'file-too-large'
  | 'read-failed'
  | 'revision-conflict'
  | 'confirmation-denied'
  | 'write-failed'
  | 'backup-failed'
  | 'cancelled'
  | 'timeout'

export interface PluginHostsMutationRequest {
  readonly operation: 'upsert' | 'remove'
  readonly hostname: string
  readonly addresses?: readonly string[]
  readonly expectedRevision?: string
}

export type PluginHostsMutationResult =
  | {
      readonly status: 'started'
      readonly revision: string
      readonly backupCreated: boolean
    }
  | {
      readonly status: 'blocked' | 'failed'
      readonly reason: PluginHostsReason
    }

export interface TrustedPluginHostsService {
  read(signal: AbortSignal): Promise<PluginHostsSnapshot>
  apply(
    request: PluginHostsMutationRequest,
    signal: AbortSignal
  ): Promise<PluginHostsMutationResult>
}

export interface PluginHostsCapabilityOptions {
  readonly activation: PluginActivationIdentity
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeRead(pluginName: string): boolean
  authorizeWrite(pluginName: string): boolean
  authorizeShell(pluginName: string): boolean
  watchReadPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  watchWritePermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  watchShellPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly service: TrustedPluginHostsService
}

export interface PluginHostsCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close(): Promise<void>
}

export interface PluginHostsFilesystem {
  lstat(filePath: string): Promise<Stats>
  realpath(filePath: string): Promise<string>
  open(filePath: string, flags: number, mode?: number): Promise<FileHandle>
  rename(oldPath: string, newPath: string): Promise<void>
  unlink(filePath: string): Promise<void>
  readdir(directory: string): Promise<string[]>
}

export interface PluginHostsReplaceRequest {
  readonly targetPath: string
  readonly stagedPath: string
  readonly expectedRevision: string
  readonly replacementRevision: string
  readonly mode: number
}

export type PluginHostsReplaceOutcome = 'committed'

export interface FixedPluginHostsServiceOptions {
  readonly platform: NodeJS.Platform
  readonly windowsDirectory?: string
  readonly backupDirectory: string
  readonly filesystem?: Partial<PluginHostsFilesystem>
  confirmMutation(request: PluginHostsMutationRequest, signal: AbortSignal): Promise<boolean>
  replaceFile(
    request: PluginHostsReplaceRequest,
    signal: AbortSignal
  ): Promise<PluginHostsReplaceOutcome>
}

const TRUSTED_SERVICES = new WeakSet<object>()
const MAX_FILE_BYTES = 1024 * 1024
const MAX_ENTRIES = 128
const MAX_ADDRESSES = 16
const MAX_HOSTNAME_BYTES = 253
const MAX_ADDRESS_BYTES = 45
const MAX_COMMENT_BYTES = 96
const MAX_REVISION_BYTES = 128
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const REVISION_PATTERN = /^[a-f0-9]{64}$/
const REASON_VALUES = new Set<PluginHostsReason>([
  'permission-denied',
  'permission-unavailable',
  'path-unsupported',
  'file-missing',
  'file-invalid',
  'file-too-large',
  'read-failed',
  'revision-conflict',
  'confirmation-denied',
  'write-failed',
  'backup-failed',
  'cancelled',
  'timeout'
])

function invalid(): never {
  throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
}

function assertSignal(signal: AbortSignal): void {
  if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
}

function isCapabilityCancellation(error: unknown): boolean {
  const code =
    error instanceof PluginHostCapabilityError
      ? error.code
      : error instanceof Error
        ? error.message
        : ''
  return code === 'PLUGIN_HOST_CAPABILITY_CANCELLED' || code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT'
}

function bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function boundedString(value: unknown, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || bytes(value) > maximum || (!allowEmpty && value.trim() === '')) {
    invalid()
  }
  if (hasControlCharacter(value)) invalid()
  return value
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
  const result: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key)) invalid()
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    result[key] = descriptor.value
  }
  for (const key of requiredKeys) if (!Object.hasOwn(result, key)) invalid()
  return result
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
  const result: unknown[] = []
  for (let index = 0; index < Number(length); index += 1) {
    const key = String(index)
    allowed.add(key)
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    result.push(descriptor.value)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) invalid()
  return result
}

function isIPv4(value: string): boolean {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number.parseInt(part, 10) <= 255)
  )
}

function isIPv6(value: string): boolean {
  if (value.length > MAX_ADDRESS_BYTES || !/^[0-9a-f:]+$/i.test(value)) return false
  const compression = value.match(/::/g) ?? []
  if (compression.length > 1) return false
  const halves = value.split('::')
  const validGroup = (group: string): boolean => /^[0-9a-f]{1,4}$/i.test(group)
  if (halves.length === 1) {
    const groups = halves[0]!.split(':')
    return groups.length === 8 && groups.every(validGroup)
  }
  const left = halves[0] ? halves[0]!.split(':') : []
  const right = halves[1] ? halves[1]!.split(':') : []
  return left.every(validGroup) && right.every(validGroup) && left.length + right.length < 8
}

function safeHostname(value: unknown): string {
  const hostname = boundedString(value, MAX_HOSTNAME_BYTES).toLowerCase()
  if (!HOSTNAME_PATTERN.test(hostname) || hostname === 'localhost') invalid()
  return hostname
}

function safeAddress(value: unknown): string {
  const address = boundedString(value, MAX_ADDRESS_BYTES)
  if (
    /\s/.test(address) ||
    address === '255.255.255.255' ||
    address === '0.0.0.0' ||
    address === '::'
  )
    invalid()
  if (!isIPv4(address) && !isIPv6(address)) invalid()
  return address
}

function safeComment(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const comment = boundedString(value, MAX_COMMENT_BYTES, true)
  return comment || undefined
}

function safeRevision(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const revision = boundedString(value, MAX_REVISION_BYTES)
  if (!REVISION_PATTERN.test(revision)) invalid()
  return revision
}

function validateRequest(
  value: unknown
): PluginHostsMutationRequest | { readonly operation: 'read' } {
  const record = exactRecord(
    value,
    ['operation', 'hostname', 'addresses', 'expectedRevision'],
    ['operation']
  )
  if (record.operation === 'read') {
    if (Object.keys(record).length !== 1) invalid()
    return Object.freeze({ operation: 'read' as const })
  }
  if (record.operation !== 'upsert' && record.operation !== 'remove') invalid()
  const hostname = safeHostname(record.hostname)
  const expectedRevision = safeRevision(record.expectedRevision)
  if (record.operation === 'upsert') {
    const addresses = exactArray(record.addresses, MAX_ADDRESSES).map(safeAddress)
    if (addresses.length === 0 || new Set(addresses).size !== addresses.length) invalid()
    return Object.freeze({
      operation: 'upsert' as const,
      hostname,
      addresses: Object.freeze(addresses),
      ...(expectedRevision === undefined ? {} : { expectedRevision })
    })
  }
  if (Object.hasOwn(record, 'addresses')) invalid()
  return Object.freeze({
    operation: 'remove' as const,
    hostname,
    ...(expectedRevision === undefined ? {} : { expectedRevision })
  })
}

function validateEntry(value: unknown): PluginHostsEntry {
  const record = exactRecord(value, ['hostname', 'addresses', 'comment'], ['hostname', 'addresses'])
  const hostname = safeHostname(record.hostname)
  const addresses = exactArray(record.addresses, MAX_ADDRESSES).map(safeAddress)
  if (addresses.length === 0 || new Set(addresses).size !== addresses.length) invalid()
  const comment = safeComment(record.comment)
  return Object.freeze({
    hostname,
    addresses: Object.freeze(addresses),
    ...(comment === undefined ? {} : { comment })
  })
}

function validateResult(value: unknown): PluginHostsSnapshot | PluginHostsMutationResult {
  const record = exactRecord(
    value,
    ['status', 'revision', 'entries', 'reason', 'backupCreated'],
    ['status']
  )
  if (record.status === 'ready') {
    const revision = boundedString(record.revision, MAX_REVISION_BYTES)
    if (!REVISION_PATTERN.test(revision)) invalid()
    const entries = exactArray(record.entries, MAX_ENTRIES).map(validateEntry)
    return Object.freeze({ status: 'ready' as const, revision, entries: Object.freeze(entries) })
  }
  if (record.status === 'degraded' || record.status === 'unsupported') {
    const reason = record.reason
    if (typeof reason !== 'string' || !REASON_VALUES.has(reason as PluginHostsReason)) invalid()
    const entries = Object.hasOwn(record, 'entries') ? exactArray(record.entries, 0) : []
    return Object.freeze({
      status: record.status,
      reason: reason as PluginHostsReason,
      entries: Object.freeze(entries as [])
    })
  }
  if (record.status === 'started') {
    const revision = boundedString(record.revision, MAX_REVISION_BYTES)
    if (!REVISION_PATTERN.test(revision) || typeof record.backupCreated !== 'boolean') invalid()
    return Object.freeze({
      status: 'started' as const,
      revision,
      backupCreated: record.backupCreated
    })
  }
  if (record.status === 'blocked' || record.status === 'failed') {
    const reason = record.reason
    if (typeof reason !== 'string' || !REASON_VALUES.has(reason as PluginHostsReason)) invalid()
    return Object.freeze({ status: record.status, reason: reason as PluginHostsReason })
  }
  invalid()
}

function snapshotActivation(value: unknown): PluginActivationIdentity {
  const record = exactRecord(
    value,
    ['name', 'pluginInstanceId', 'activationGeneration', 'key'],
    ['name', 'pluginInstanceId', 'activationGeneration', 'key']
  )
  const generation = record.activationGeneration
  if (!Number.isSafeInteger(generation) || Number(generation) < 1) invalid()
  return Object.freeze({
    name: boundedString(record.name, 128),
    pluginInstanceId: boundedString(record.pluginInstanceId, 128),
    activationGeneration: Number(generation),
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

function readOwnMethod<T extends (...args: never[]) => unknown>(value: unknown, key: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value))
    invalid()
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (
    !descriptor?.enumerable ||
    !('value' in descriptor) ||
    typeof descriptor.value !== 'function'
  ) {
    invalid()
  }
  return descriptor.value as T
}

function assertTrustedService(value: unknown): asserts value is TrustedPluginHostsService {
  if (!value || typeof value !== 'object' || !TRUSTED_SERVICES.has(value)) invalid()
  readOwnMethod<TrustedPluginHostsService['read']>(value, 'read')
  readOwnMethod<TrustedPluginHostsService['apply']>(value, 'apply')
}

export function createPluginHostsCapabilities(
  rawOptions: PluginHostsCapabilityOptions
): PluginHostsCapabilities {
  const options = exactRecord(rawOptions, [
    'activation',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeRead',
    'authorizeWrite',
    'authorizeShell',
    'watchReadPermissionRevoked',
    'watchWritePermissionRevoked',
    'watchShellPermissionRevoked',
    'service'
  ]) as unknown as PluginHostsCapabilityOptions
  for (const key of [
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeRead',
    'authorizeWrite',
    'authorizeShell',
    'watchReadPermissionRevoked',
    'watchWritePermissionRevoked',
    'watchShellPermissionRevoked'
  ] as const) {
    if (typeof options[key] !== 'function' || utilTypes.isProxy(options[key])) invalid()
  }
  const expected = snapshotActivation(options.activation)
  if (!isPrivilegedPluginFor('hosts', expected.name)) invalid()
  assertTrustedService(options.service)
  const service = options.service
  const resolveCurrentActivation = options.resolveCurrentActivation
  const resolveHostGeneration = options.resolveHostGeneration
  const permissionDisposers: Array<() => void> = []
  const controllers = new Set<AbortController>()
  const operations = new Set<Promise<void>>()
  let closed = false
  let permissionsAvailable = true
  let closePromise: Promise<void> | null = null

  const abortAll = (): void => {
    for (const controller of controllers) controller.abort()
  }
  const revoke = (): void => abortAll()
  for (const watcher of [
    options.watchReadPermissionRevoked,
    options.watchWritePermissionRevoked,
    options.watchShellPermissionRevoked
  ]) {
    try {
      const disposer = watcher.call(rawOptions, expected.name, revoke)
      if (typeof disposer !== 'function' || utilTypes.isProxy(disposer)) invalid()
      permissionDisposers.push(disposer)
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
      !Number.isSafeInteger(identity.hostGeneration) ||
      Number(identity.hostGeneration) < 1
    ) {
      invalid()
    }
    const current = resolveCurrentActivation.call(rawOptions, expected.name)
    if (!current || !sameActivation(snapshotActivation(current), expected)) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
    if (resolveHostGeneration.call(rawOptions, expected) !== identity.hostGeneration) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
  }

  const authorize = (kind: 'read' | 'write' | 'shell'): void => {
    if (!permissionsAvailable) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    const callback =
      kind === 'read'
        ? options.authorizeRead
        : kind === 'write'
          ? options.authorizeWrite
          : options.authorizeShell
    let result: unknown
    try {
      result = callback.call(rawOptions, expected.name)
    } catch {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    if (typeof result !== 'boolean') {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    if (!result) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
  }

  const invokeService = async (
    request: PluginHostsMutationRequest | { readonly operation: 'read' },
    signal: AbortSignal
  ): Promise<PluginHostsSnapshot | PluginHostsMutationResult> => {
    assertSignal(signal)
    if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    controllers.add(controller)
    let finish!: () => void
    const operation = new Promise<void>((resolve) => {
      finish = resolve
    })
    operations.add(operation)
    try {
      assertSignal(controller.signal)
      const result =
        request.operation === 'read'
          ? await service.read(controller.signal)
          : await service.apply(request, controller.signal)
      const committedMutation = request.operation !== 'read' && result.status === 'started'
      if (!committedMutation) assertSignal(controller.signal)
      return result
    } finally {
      signal.removeEventListener('abort', onAbort)
      controllers.delete(controller)
      operations.delete(operation)
      finish()
    }
  }

  const definition: PluginHostCapabilityDefinition<
    PluginHostsMutationRequest | { readonly operation: 'read' },
    PluginHostsSnapshot | PluginHostsMutationResult
  > = Object.freeze({
    id: 'system.hosts',
    permission: 'fs.read',
    timeoutMs: 30_000,
    maxConcurrency: 1,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest,
    validateResult,
    isCommittedResult: (result: unknown) =>
      Boolean(
        result &&
        typeof result === 'object' &&
        !utilTypes.isProxy(result) &&
        Object.getOwnPropertyDescriptor(result, 'status')?.value === 'started'
      ),
    async invoke(
      context: PluginSecurityContext,
      request: PluginHostsMutationRequest | { readonly operation: 'read' },
      signal: AbortSignal
    ) {
      assertAuthority(context)
      if (request.operation === 'read') {
        authorize('read')
      } else {
        authorize('read')
        authorize('write')
        authorize('shell')
      }
      return validateResult(await invokeService(request, signal))
    }
  })
  return Object.freeze({
    definitions: Object.freeze([definition]),
    close(): Promise<void> {
      if (closePromise) return closePromise
      closed = true
      abortAll()
      for (const dispose of permissionDisposers.splice(0)) {
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

interface InternalHostsSnapshot {
  readonly raw: string
  readonly revision: string
  readonly entries: readonly PluginHostsEntry[]
  readonly mode: number
}
const defaultFilesystem: PluginHostsFilesystem = Object.freeze({
  lstat: (filePath: string) => fsp.lstat(filePath),
  realpath: (filePath: string) => fsp.realpath(filePath),
  open: (filePath: string, flags: number, mode?: number) => fsp.open(filePath, flags, mode),
  rename: (oldPath: string, newPath: string) => fsp.rename(oldPath, newPath),
  unlink: (filePath: string) => fsp.unlink(filePath),
  readdir: (directory: string) => fsp.readdir(directory)
})

function hostsPath(options: FixedPluginHostsServiceOptions): string {
  if (options.platform === 'darwin') return '/private/etc/hosts'
  if (options.platform === 'linux') return '/etc/hosts'
  if (options.platform === 'win32') {
    const root = options.windowsDirectory?.trim()
    if (!root) throw new Error('path-unsupported')
    return path.win32.join(root, 'System32', 'drivers', 'etc', 'hosts')
  }
  throw new Error('path-unsupported')
}

function canonicalSame(left: string, right: string, platform: NodeJS.Platform): boolean {
  const normalize = platform === 'win32' ? path.win32.normalize : path.posix.normalize
  const a = normalize(left)
  const b = normalize(right)
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function parseHosts(raw: string): readonly PluginHostsEntry[] {
  const merged = new Map<string, { addresses: string[] }>()
  for (const line of raw.split(/\r?\n/)) {
    const withoutComment = line.split('#', 1)[0]!.trim()
    if (!withoutComment) continue
    const tokens = withoutComment.split(/\s+/)
    if (tokens.length < 2) continue
    const address = tokens.shift()!
    if (
      (!isIPv4(address) && !isIPv6(address)) ||
      address === '0.0.0.0' ||
      address === '255.255.255.255' ||
      address === '::'
    )
      continue
    for (const token of tokens.slice(0, MAX_ENTRIES)) {
      if (!HOSTNAME_PATTERN.test(token) || token.toLowerCase() === 'localhost') continue
      const hostname = token.toLowerCase()
      const current = merged.get(hostname) ?? { addresses: [] }
      if (!current.addresses.includes(address) && current.addresses.length < MAX_ADDRESSES) {
        current.addresses.push(address)
      }
      merged.set(hostname, current)
      if (merged.size >= MAX_ENTRIES) break
    }
    if (merged.size >= MAX_ENTRIES) break
  }
  return Object.freeze(
    [...merged.entries()].map(([hostname, value]) =>
      Object.freeze({
        hostname,
        addresses: Object.freeze(value.addresses)
      })
    )
  )
}

function revisionOf(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

async function readBoundedFile(
  filesystem: PluginHostsFilesystem,
  filePath: string,
  platform: NodeJS.Platform,
  signal: AbortSignal
): Promise<InternalHostsSnapshot> {
  assertSignal(signal)
  let stats: Stats
  let canonical: string
  try {
    stats = await filesystem.lstat(filePath)
    canonical = await filesystem.realpath(filePath)
  } catch (error) {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
    throw new Error(code === 'ENOENT' ? 'file-missing' : 'read-failed')
  }
  if (!stats.isFile() || !canonicalSame(canonical, filePath, platform))
    throw new Error('file-invalid')
  if (stats.size > MAX_FILE_BYTES) throw new Error('file-too-large')
  let handle: FileHandle | undefined
  try {
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
    handle = await filesystem.open(filePath, constants.O_RDONLY | noFollow)
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== stats.dev || opened.ino !== stats.ino) {
      throw new Error('file-invalid')
    }
    const raw = await handle.readFile({ encoding: 'utf8' })
    if (bytes(raw) > MAX_FILE_BYTES) throw new Error('file-too-large')
    assertSignal(signal)
    return Object.freeze({
      raw,
      revision: revisionOf(raw),
      entries: parseHosts(raw),
      mode: opened.mode & 0o777
    })
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

async function writeExclusive(
  filesystem: PluginHostsFilesystem,
  target: string,
  content: string,
  mode: number,
  signal: AbortSignal
): Promise<void> {
  assertSignal(signal)
  if (bytes(content) > MAX_FILE_BYTES) throw new Error('file-too-large')
  let handle: FileHandle | undefined
  let completed = false
  let created = false
  try {
    handle = await filesystem.open(
      target,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600
    )
    created = true
    await handle.writeFile(content, { encoding: 'utf8' })
    await handle.sync()
    await handle.chmod(mode || 0o644)
    completed = true
  } finally {
    await handle?.close().catch(() => undefined)
    if (created && !completed) await filesystem.unlink(target).catch(() => undefined)
  }
}

function applyRaw(raw: string, request: PluginHostsMutationRequest): string {
  const lines = raw.split(/\r?\n/)
  const output: string[] = []
  for (const line of lines) {
    const match = line.match(/^(\s*)([^#]*?)(\s+#.*)?$/)
    if (!match) {
      output.push(line)
      continue
    }
    const body = match[2]!.trim()
    const tokens = body ? body.split(/\s+/) : []
    if (tokens.length < 2 || (!isIPv4(tokens[0]!) && !isIPv6(tokens[0]!))) {
      output.push(line)
      continue
    }
    const remaining = tokens.slice(1).filter((name) => name.toLowerCase() !== request.hostname)
    if (remaining.length === tokens.length - 1) {
      output.push(line)
      continue
    }
    if (remaining.length > 0) {
      output.push(`${match[1]}${tokens[0]} ${remaining.join(' ')}${match[3] ?? ''}`.trimEnd())
    }
  }
  if (request.operation === 'upsert') {
    while (output.length > 0 && output[output.length - 1]!.trim() === '') output.pop()
    for (const address of request.addresses!) output.push(`${address} ${request.hostname}`)
  }
  return `${output.join('\n').replace(/\n*$/, '')}\n`
}

async function pruneHostBackups(
  filesystem: PluginHostsFilesystem,
  backupDirectory: string
): Promise<void> {
  try {
    const names = (await filesystem.readdir(backupDirectory)).filter((name) =>
      /^hosts-\d+-[0-9a-f-]+\.bak$/i.test(name)
    )
    const records = await Promise.all(
      names.map(async (name) => ({
        name,
        modified: (await filesystem.lstat(path.join(backupDirectory, name))).mtimeMs
      }))
    )
    records.sort((left, right) => right.modified - left.modified)
    await Promise.all(
      records
        .slice(10)
        .map((record) =>
          filesystem.unlink(path.join(backupDirectory, record.name)).catch(() => undefined)
        )
    )
  } catch {
    // Retention cleanup must not invalidate the newly verified backup.
  }
}

export function createFixedPluginHostsService(
  rawOptions: FixedPluginHostsServiceOptions
): TrustedPluginHostsService {
  const options = rawOptions
  if (
    typeof options.confirmMutation !== 'function' ||
    utilTypes.isProxy(options.confirmMutation) ||
    typeof options.replaceFile !== 'function' ||
    utilTypes.isProxy(options.replaceFile) ||
    !path.isAbsolute(options.backupDirectory) ||
    options.backupDirectory.includes('\0')
  ) {
    invalid()
  }
  const filesystem = Object.freeze({ ...defaultFilesystem, ...(options.filesystem ?? {}) })
  const filePath = (() => {
    try {
      return hostsPath(options)
    } catch {
      return null
    }
  })()
  const service: TrustedPluginHostsService = {
    async read(signal) {
      if (!filePath) {
        return Object.freeze({
          status: 'unsupported' as const,
          reason: 'path-unsupported' as const,
          entries: Object.freeze([])
        })
      }
      try {
        const snapshot = await readBoundedFile(filesystem, filePath, options.platform, signal)
        return Object.freeze({
          status: 'ready' as const,
          revision: snapshot.revision,
          entries: snapshot.entries
        })
      } catch (error) {
        if (isCapabilityCancellation(error)) throw error
        const reason =
          error instanceof Error && REASON_VALUES.has(error.message as PluginHostsReason)
            ? (error.message as PluginHostsReason)
            : 'read-failed'
        return Object.freeze({
          status: reason === 'path-unsupported' ? ('unsupported' as const) : ('degraded' as const),
          reason,
          entries: Object.freeze([])
        })
      }
    },
    async apply(request, signal) {
      if (!filePath) {
        return Object.freeze({ status: 'failed' as const, reason: 'path-unsupported' as const })
      }
      assertSignal(signal)
      let before: InternalHostsSnapshot
      try {
        before = await readBoundedFile(filesystem, filePath, options.platform, signal)
      } catch (error) {
        if (isCapabilityCancellation(error)) throw error
        const reason =
          error instanceof Error && REASON_VALUES.has(error.message as PluginHostsReason)
            ? (error.message as PluginHostsReason)
            : 'read-failed'
        return Object.freeze({ status: 'failed' as const, reason })
      }
      if (request.expectedRevision && request.expectedRevision !== before.revision) {
        return Object.freeze({ status: 'blocked' as const, reason: 'revision-conflict' as const })
      }
      const next = applyRaw(before.raw, request)
      if (next === before.raw) {
        return Object.freeze({
          status: 'started' as const,
          revision: before.revision,
          backupCreated: false
        })
      }
      let confirmed: boolean
      try {
        confirmed = await options.confirmMutation(request, signal)
      } catch (error) {
        if (isCapabilityCancellation(error)) throw error
        return Object.freeze({ status: 'blocked' as const, reason: 'confirmation-denied' as const })
      }
      if (!confirmed) {
        return Object.freeze({ status: 'blocked' as const, reason: 'confirmation-denied' as const })
      }
      assertSignal(signal)
      const suffix = `${Date.now()}-${randomUUID()}`
      const backupPath = path.join(options.backupDirectory, `hosts-${suffix}.bak`)
      const stagedPath = path.join(options.backupDirectory, `.hosts-stage-${suffix}`)
      try {
        await writeExclusive(filesystem, backupPath, before.raw, 0o600, signal)
        await writeExclusive(filesystem, stagedPath, next, 0o600, signal)
        await pruneHostBackups(filesystem, options.backupDirectory)
      } catch {
        return Object.freeze({ status: 'failed' as const, reason: 'backup-failed' as const })
      }
      let committed = false
      try {
        const latest = await readBoundedFile(filesystem, filePath, options.platform, signal)
        if (latest.revision !== before.revision) {
          return Object.freeze({ status: 'blocked' as const, reason: 'revision-conflict' as const })
        }
        const replacementRevision = revisionOf(next)
        const outcome = await options.replaceFile(
          Object.freeze({
            targetPath: filePath,
            stagedPath,
            expectedRevision: before.revision,
            replacementRevision,
            mode: before.mode
          }),
          signal
        )
        if (outcome !== 'committed') throw new Error('write-verification-failed')
        committed = true
        return Object.freeze({
          status: 'started' as const,
          revision: replacementRevision,
          backupCreated: true
        })
      } catch (error) {
        if (isCapabilityCancellation(error)) throw error
        if (error instanceof Error && error.message === 'revision-conflict') {
          return Object.freeze({ status: 'blocked' as const, reason: 'revision-conflict' as const })
        }
        return Object.freeze({ status: 'failed' as const, reason: 'write-failed' as const })
      } finally {
        const cleanup = filesystem.unlink(stagedPath).catch(() => undefined)
        if (!committed) await cleanup
        else void cleanup
      }
    }
  }
  Object.freeze(service)
  TRUSTED_SERVICES.add(service)
  return service
}
