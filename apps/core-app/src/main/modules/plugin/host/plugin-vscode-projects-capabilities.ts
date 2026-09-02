import { constants, type Stats } from 'node:fs'
import fsp, { type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { types as utilTypes } from 'node:util'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'
import { hasControlCharacter } from './plugin-host-text-validation'

export type PluginVscodeProjectKind = 'folder' | 'workspace' | 'file'
export type PluginVscodeProjectsReason =
  | 'permission-denied'
  | 'permission-unavailable'
  | 'platform-unsupported'
  | 'source-disabled'
  | 'storage-missing'
  | 'storage-invalid'
  | 'storage-too-large'
  | 'read-failed'
  | 'project-missing'
  | 'project-replaced'
  | 'token-expired'
  | 'open-failed'
  | 'cancelled'
  | 'timeout'

export interface PluginVscodeProjectDto {
  readonly token: string
  readonly label: string
  readonly kind: PluginVscodeProjectKind
  readonly lastOpenedAt?: string
}

export type PluginVscodeProjectsSnapshot =
  | { readonly status: 'ready'; readonly projects: readonly PluginVscodeProjectDto[] }
  | {
      readonly status: 'degraded' | 'unsupported'
      readonly projects: readonly PluginVscodeProjectDto[]
      readonly reason: PluginVscodeProjectsReason
    }

export type PluginVscodeProjectOpenResult =
  | { readonly status: 'started' }
  | { readonly status: 'blocked' | 'failed'; readonly reason: PluginVscodeProjectsReason }

export interface TrustedPluginVscodeProjectsService {
  list(signal: AbortSignal): Promise<PluginVscodeProjectsSnapshot>
  open(token: string, signal: AbortSignal): Promise<PluginVscodeProjectOpenResult>
  invalidate(): void
  close(): void | Promise<void>
}

export interface PluginVscodeProjectsCapabilityOptions {
  readonly activation: PluginActivationIdentity
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeRead(pluginName: string): boolean
  authorizeIndex(pluginName: string): boolean
  authorizeShell(pluginName: string): boolean
  watchReadPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  watchIndexPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  watchShellPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly service: TrustedPluginVscodeProjectsService
}

export interface PluginVscodeProjectsCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close(): Promise<void>
}

export interface PluginVscodeProjectsFilesystem {
  lstat(filePath: string): Promise<Stats>
  stat(filePath: string): Promise<Stats>
  realpath(filePath: string): Promise<string>
  open(filePath: string, flags: number): Promise<FileHandle>
}

export interface PluginVscodeProjectIdentityProof {
  readonly canonicalPath: string
  readonly dev: string
  readonly ino: string
  readonly kind: PluginVscodeProjectKind
  readonly channel: 'stable' | 'insiders'
}

export interface FixedPluginVscodeProjectsServiceOptions {
  readonly platform: NodeJS.Platform
  readonly homeDirectory: string
  readonly appDataDirectory?: string
  readonly environment?: Readonly<Record<string, string | undefined>>
  readonly filesystem?: Partial<PluginVscodeProjectsFilesystem>
  readonly now?: () => number
  openPath(
    path: string,
    kind: PluginVscodeProjectKind,
    signal: AbortSignal,
    identity: PluginVscodeProjectIdentityProof
  ): Promise<void>
}

interface ProjectIdentity {
  readonly path: string
  readonly canonicalPath: string
  readonly kind: PluginVscodeProjectKind
  readonly dev: string
  readonly ino: string
  readonly label: string
  readonly lastOpenedAt?: string
  readonly channel: 'stable' | 'insiders'
}

interface ProjectTokenRecord {
  readonly identity: ProjectIdentity
  readonly expiresAt: number
}

interface VscodeStorageCandidate {
  readonly path: string
  readonly channel: 'stable' | 'insiders'
}

interface VscodeProjectCandidate {
  readonly value: string
  readonly channel: 'stable' | 'insiders'
}

const TRUSTED_SERVICES = new WeakSet<object>()
const MAX_PROJECTS = 100
const MAX_STORAGE_BYTES = 2 * 1024 * 1024
const MAX_PATH_BYTES = 4096
const MAX_LABEL_BYTES = 128
const TOKEN_TTL_MS = 5 * 60_000
const TOKEN_PATTERN = /^vsp_[A-Za-z0-9_-]{32}$/
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const REASONS = new Set<PluginVscodeProjectsReason>([
  'permission-denied',
  'permission-unavailable',
  'platform-unsupported',
  'source-disabled',
  'storage-missing',
  'storage-invalid',
  'storage-too-large',
  'read-failed',
  'project-missing',
  'project-replaced',
  'token-expired',
  'open-failed',
  'cancelled',
  'timeout'
])

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
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
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

function truncateUtf8(value: string, maximum: number): string {
  const encoded = Buffer.from(value, 'utf8')
  if (encoded.byteLength <= maximum) return value
  let end = maximum
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) end -= 1
  return encoded.subarray(0, end).toString('utf8')
}

function boundedString(value: unknown, maximum: number, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') > maximum ||
    (!allowEmpty && value.trim() === '') ||
    hasControlCharacter(value)
  )
    invalid()
  return value.trim()
}

function validateRequest(
  value: unknown
): { readonly operation: 'list' } | { readonly operation: 'open'; readonly token: string } {
  const record = exactRecord(value, ['operation', 'token'], ['operation'])
  if (record.operation === 'list') {
    if (Object.keys(record).length !== 1) invalid()
    return Object.freeze({ operation: 'list' as const })
  }
  if (record.operation !== 'open') invalid()
  const token = boundedString(record.token, 36)
  if (!TOKEN_PATTERN.test(token)) invalid()
  return Object.freeze({ operation: 'open' as const, token })
}

function validateProject(value: unknown): PluginVscodeProjectDto {
  const record = exactRecord(
    value,
    ['token', 'label', 'kind', 'lastOpenedAt'],
    ['token', 'label', 'kind']
  )
  const token = boundedString(record.token, 36)
  if (!TOKEN_PATTERN.test(token)) invalid()
  const label = boundedString(record.label, MAX_LABEL_BYTES)
  if (label.includes('/') || label.includes('\\')) invalid()
  if (record.kind !== 'folder' && record.kind !== 'workspace' && record.kind !== 'file') invalid()
  const lastOpenedAt = Object.hasOwn(record, 'lastOpenedAt')
    ? boundedString(record.lastOpenedAt, 32)
    : undefined
  if (
    lastOpenedAt !== undefined &&
    (!ISO_TIMESTAMP.test(lastOpenedAt) || !Number.isFinite(Date.parse(lastOpenedAt)))
  )
    invalid()
  return Object.freeze({
    token,
    label,
    kind: record.kind,
    ...(lastOpenedAt === undefined ? {} : { lastOpenedAt })
  })
}

function validateResult(
  value: unknown
): PluginVscodeProjectsSnapshot | PluginVscodeProjectOpenResult {
  const record = exactRecord(value, ['status', 'projects', 'reason'], ['status'])
  if (record.status === 'ready') {
    const projects = exactArray(record.projects, MAX_PROJECTS).map(validateProject)
    return Object.freeze({ status: 'ready' as const, projects: Object.freeze(projects) })
  }
  if (record.status === 'degraded' || record.status === 'unsupported') {
    if (!REASONS.has(record.reason as PluginVscodeProjectsReason)) invalid()
    const projects = Object.hasOwn(record, 'projects') ? exactArray(record.projects, 0) : []
    if (projects.length !== 0) invalid()
    return Object.freeze({
      status: record.status,
      projects: Object.freeze([]),
      reason: record.reason as PluginVscodeProjectsReason
    })
  }
  if (record.status === 'started') {
    if (Object.keys(record).length !== 1) invalid()
    return Object.freeze({ status: 'started' as const })
  }
  if (record.status === 'blocked' || record.status === 'failed') {
    if (!REASONS.has(record.reason as PluginVscodeProjectsReason)) invalid()
    return Object.freeze({
      status: record.status,
      reason: record.reason as PluginVscodeProjectsReason
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

export function createPluginVscodeProjectsCapabilities(
  rawOptions: PluginVscodeProjectsCapabilityOptions
): PluginVscodeProjectsCapabilities {
  const options = exactRecord(rawOptions, [
    'activation',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeRead',
    'authorizeIndex',
    'authorizeShell',
    'watchReadPermissionRevoked',
    'watchIndexPermissionRevoked',
    'watchShellPermissionRevoked',
    'service'
  ]) as unknown as PluginVscodeProjectsCapabilityOptions
  for (const key of [
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeRead',
    'authorizeIndex',
    'authorizeShell',
    'watchReadPermissionRevoked',
    'watchIndexPermissionRevoked',
    'watchShellPermissionRevoked'
  ] as const) {
    if (typeof options[key] !== 'function' || utilTypes.isProxy(options[key])) invalid()
  }
  const expected = snapshotActivation(options.activation)
  if (expected.name !== 'touch-vscode-projects') invalid()
  const list = serviceMethod<TrustedPluginVscodeProjectsService['list']>(options.service, 'list')
  const open = serviceMethod<TrustedPluginVscodeProjectsService['open']>(options.service, 'open')
  const invalidate = serviceMethod<TrustedPluginVscodeProjectsService['invalidate']>(
    options.service,
    'invalidate'
  )
  const closeService = serviceMethod<TrustedPluginVscodeProjectsService['close']>(
    options.service,
    'close'
  )
  const controllers = new Set<AbortController>()
  const operations = new Set<Promise<void>>()
  const disposers: Array<() => void> = []
  let closed = false
  let permissionsAvailable = true
  let closePromise: Promise<void> | null = null
  const abortAll = (): void => {
    for (const controller of controllers) controller.abort()
  }
  const revoke = (): void => {
    Reflect.apply(invalidate, options.service, [])
    abortAll()
  }
  for (const watch of [
    options.watchReadPermissionRevoked,
    options.watchIndexPermissionRevoked,
    options.watchShellPermissionRevoked
  ]) {
    try {
      const dispose = watch.call(rawOptions, expected.name, revoke)
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
      !Number.isSafeInteger(identity.hostGeneration) ||
      Number(identity.hostGeneration) < 1
    )
      invalid()
    const current = options.resolveCurrentActivation.call(rawOptions, expected.name)
    if (
      !current ||
      !sameActivation(snapshotActivation(current), expected) ||
      options.resolveHostGeneration.call(rawOptions, expected) !== identity.hostGeneration
    )
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
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
    { readonly operation: 'list' } | { readonly operation: 'open'; readonly token: string },
    PluginVscodeProjectsSnapshot | PluginVscodeProjectOpenResult
  > = Object.freeze({
    id: 'filesystem.vscode-projects',
    permission: 'fs.read',
    timeoutMs: 30_000,
    maxConcurrency: 2,
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
    invoke: async (
      context: PluginSecurityContext,
      request:
        | { readonly operation: 'list' }
        | { readonly operation: 'open'; readonly token: string },
      signal: AbortSignal
    ) => {
      assertAuthority(context)
      authorize(options.authorizeRead)
      if (request.operation === 'list') authorize(options.authorizeIndex)
      else authorize(options.authorizeShell)
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
        const result =
          request.operation === 'list'
            ? await Reflect.apply(list, options.service, [controller.signal])
            : await Reflect.apply(open, options.service, [request.token, controller.signal])
        const validated = validateResult(result)
        if (controller.signal.aborted && validated.status !== 'started') {
          throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
        }
        return validated
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
      closePromise = Promise.allSettled([...operations]).then(async () => {
        await Reflect.apply(closeService, options.service, [])
      })
      return closePromise
    }
  })
}

const defaultFilesystem: PluginVscodeProjectsFilesystem = Object.freeze({
  lstat: (filePath: string) => fsp.lstat(filePath),
  stat: (filePath: string) => fsp.stat(filePath),
  realpath: (filePath: string) => fsp.realpath(filePath),
  open: (filePath: string, flags: number) => fsp.open(filePath, flags)
})

function storageCandidates(
  options: FixedPluginVscodeProjectsServiceOptions
): readonly VscodeStorageCandidate[] {
  if (options.platform === 'darwin') {
    return Object.freeze([
      {
        path: path.join(
          options.homeDirectory,
          'Library',
          'Application Support',
          'Code',
          'User',
          'globalStorage',
          'storage.json'
        ),
        channel: 'stable' as const
      },
      {
        path: path.join(
          options.homeDirectory,
          'Library',
          'Application Support',
          'Code - Insiders',
          'User',
          'globalStorage',
          'storage.json'
        ),
        channel: 'insiders' as const
      }
    ])
  }
  if (options.platform === 'linux') {
    return Object.freeze([
      {
        path: path.join(
          options.homeDirectory,
          '.config',
          'Code',
          'User',
          'globalStorage',
          'storage.json'
        ),
        channel: 'stable' as const
      },
      {
        path: path.join(
          options.homeDirectory,
          '.config',
          'Code - Insiders',
          'User',
          'globalStorage',
          'storage.json'
        ),
        channel: 'insiders' as const
      }
    ])
  }
  if (options.platform === 'win32') {
    const root =
      options.appDataDirectory ??
      options.environment?.APPDATA ??
      path.win32.join(options.homeDirectory, 'AppData', 'Roaming')
    return Object.freeze([
      {
        path: path.win32.join(root, 'Code', 'User', 'globalStorage', 'storage.json'),
        channel: 'stable' as const
      },
      {
        path: path.win32.join(root, 'Code - Insiders', 'User', 'globalStorage', 'storage.json'),
        channel: 'insiders' as const
      }
    ])
  }
  return Object.freeze([])
}

function samePath(left: string, right: string, platform: NodeJS.Platform): boolean {
  const normalize = platform === 'win32' ? path.win32.normalize : path.posix.normalize
  const a = normalize(left)
  const b = normalize(right)
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function uriToPath(value: unknown, platform: NodeJS.Platform): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES
  )
    return null
  if (value.startsWith('file://')) {
    try {
      const url = new URL(value)
      if (url.protocol !== 'file:' || url.hostname) return null
      const decoded = decodeURIComponent(url.pathname)
      return platform === 'win32' && /^\/[A-Za-z]:\//.test(decoded)
        ? decoded.slice(1).replace(/\//g, '\\')
        : decoded
    } catch {
      return null
    }
  }
  if (platform === 'win32' ? path.win32.isAbsolute(value) : path.posix.isAbsolute(value))
    return value
  return null
}

function collectCandidateStrings(
  value: unknown,
  output: VscodeProjectCandidate[],
  channel: VscodeProjectCandidate['channel'],
  depth = 0
): void {
  if (depth > 5 || output.length >= MAX_PROJECTS * 4) return
  if (typeof value === 'string') {
    output.push(Object.freeze({ value, channel }))
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, MAX_PROJECTS * 4))
      collectCandidateStrings(entry, output, channel, depth + 1)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (
      /^(?:openedPathsList|windowsState|lastActiveWindow|openedWindows|backupWorkspaces|workspaces3|workspaces|workspace|entries|folder|folderUri|workspaceUri|fileUri|folders|files)$/i.test(
        key
      )
    ) {
      collectCandidateStrings(entry, output, channel, depth + 1)
    }
  }
}

function kindOf(filePath: string, stats: Stats): PluginVscodeProjectKind | null {
  if (stats.isDirectory()) return 'folder'
  if (!stats.isFile()) return null
  return filePath.toLowerCase().endsWith('.code-workspace') ? 'workspace' : 'file'
}

export function createFixedPluginVscodeProjectsService(
  rawOptions: FixedPluginVscodeProjectsServiceOptions
): TrustedPluginVscodeProjectsService {
  const options = rawOptions
  const filesystem = Object.freeze({ ...defaultFilesystem, ...(options.filesystem ?? {}) })
  const candidates = storageCandidates(options)
  const tokenRecords = new Map<string, ProjectTokenRecord>()
  let closed = false
  const now = options.now ?? Date.now
  if (typeof now !== 'function') invalid()

  const readStorage = async (filePath: string, signal: AbortSignal): Promise<unknown> => {
    if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    const stats = await filesystem.lstat(filePath)
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('storage-invalid')
    if (stats.size > MAX_STORAGE_BYTES) throw new Error('storage-too-large')
    const canonical = await filesystem.realpath(filePath)
    if (!samePath(canonical, filePath, options.platform)) throw new Error('storage-invalid')
    let handle: FileHandle | undefined
    try {
      const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
      handle = await filesystem.open(filePath, constants.O_RDONLY | noFollow)
      const opened = await handle.stat()
      if (!opened.isFile() || opened.dev !== stats.dev || opened.ino !== stats.ino)
        throw new Error('storage-invalid')
      const content = await handle.readFile({ encoding: 'utf8' })
      if (Buffer.byteLength(content, 'utf8') > MAX_STORAGE_BYTES)
        throw new Error('storage-too-large')
      try {
        return JSON.parse(content)
      } catch {
        throw new Error('storage-invalid')
      }
    } finally {
      await handle?.close().catch(() => undefined)
    }
  }

  const inspectProject = async (
    candidate: VscodeProjectCandidate,
    signal: AbortSignal
  ): Promise<ProjectIdentity | null> => {
    const filePath = uriToPath(candidate.value, options.platform)
    if (!filePath || signal.aborted) return null
    try {
      const before = await filesystem.lstat(filePath)
      if (before.isSymbolicLink()) return null
      const kind = kindOf(filePath, before)
      if (!kind) return null
      const canonical = await filesystem.realpath(filePath)
      if (!samePath(canonical, filePath, options.platform)) return null
      const after = await filesystem.stat(canonical)
      if (before.dev !== after.dev || before.ino !== after.ino || kindOf(canonical, after) !== kind)
        return null
      const label = truncateUtf8(path.basename(canonical), MAX_LABEL_BYTES)
      if (!label || hasControlCharacter(label)) return null
      return Object.freeze({
        path: filePath,
        canonicalPath: canonical,
        kind,
        dev: String(after.dev),
        ino: String(after.ino),
        label,
        lastOpenedAt: new Date(Math.min(now(), after.mtimeMs || now())).toISOString(),
        channel: candidate.channel
      })
    } catch {
      return null
    }
  }

  const service: TrustedPluginVscodeProjectsService = {
    async list(signal) {
      if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
      if (candidates.length === 0) {
        return Object.freeze({
          status: 'unsupported' as const,
          projects: Object.freeze([]),
          reason: 'platform-unsupported' as const
        })
      }
      const projectCandidates: VscodeProjectCandidate[] = []
      let readOne = false
      let lastReason: PluginVscodeProjectsReason = 'storage-missing'
      for (const storageCandidate of candidates) {
        try {
          const storage = await readStorage(storageCandidate.path, signal)
          readOne = true
          collectCandidateStrings(storage, projectCandidates, storageCandidate.channel)
        } catch (error) {
          if (signal.aborted)
            throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
          const message = error instanceof Error ? error.message : ''
          const code =
            error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
          if (message === 'storage-too-large' || message === 'storage-invalid') {
            lastReason = message
          } else if (code !== 'ENOENT') {
            lastReason = 'read-failed'
          }
        }
      }
      if (!readOne) {
        return Object.freeze({
          status: 'degraded' as const,
          projects: Object.freeze([]),
          reason: lastReason
        })
      }
      const unique = new Map<string, ProjectIdentity>()
      for (const candidate of projectCandidates) {
        const identity = await inspectProject(candidate, signal)
        if (!identity) continue
        const key =
          options.platform === 'win32'
            ? identity.canonicalPath.toLowerCase()
            : identity.canonicalPath
        if (!unique.has(key)) unique.set(key, identity)
      }
      const identities = [...unique.values()]
        .sort((left, right) => (right.lastOpenedAt ?? '').localeCompare(left.lastOpenedAt ?? ''))
        .slice(0, MAX_PROJECTS)
      const currentTime = now()
      if (!Number.isFinite(currentTime))
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
      for (const [token, record] of tokenRecords) {
        if (record.expiresAt <= currentTime) tokenRecords.delete(token)
      }
      const projects = identities.map((identity) => {
        const token = `vsp_${randomBytes(24).toString('base64url')}`
        tokenRecords.set(token, Object.freeze({ identity, expiresAt: currentTime + TOKEN_TTL_MS }))
        while (tokenRecords.size > MAX_PROJECTS * 4) {
          const oldest = tokenRecords.keys().next().value
          if (typeof oldest !== 'string') break
          tokenRecords.delete(oldest)
        }
        return Object.freeze({
          token,
          label: identity.label,
          kind: identity.kind,
          ...(identity.lastOpenedAt ? { lastOpenedAt: identity.lastOpenedAt } : {})
        })
      })
      return Object.freeze({ status: 'ready' as const, projects: Object.freeze(projects) })
    },
    async open(token, signal) {
      if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
      const record = tokenRecords.get(token)
      if (!record)
        return Object.freeze({ status: 'blocked' as const, reason: 'project-missing' as const })
      const currentTime = now()
      if (!Number.isFinite(currentTime))
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
      if (record.expiresAt <= currentTime) {
        tokenRecords.delete(token)
        return Object.freeze({ status: 'blocked' as const, reason: 'token-expired' as const })
      }
      if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      const identity = record.identity
      try {
        const before = await filesystem.lstat(identity.path)
        if (before.isSymbolicLink()) throw new Error('project-replaced')
        const canonical = await filesystem.realpath(identity.path)
        const after = await filesystem.stat(canonical)
        if (
          !samePath(canonical, identity.canonicalPath, options.platform) ||
          String(after.dev) !== identity.dev ||
          String(after.ino) !== identity.ino ||
          kindOf(canonical, after) !== identity.kind
        )
          throw new Error('project-replaced')
        await options.openPath(
          canonical,
          identity.kind,
          signal,
          Object.freeze({
            canonicalPath: canonical,
            dev: identity.dev,
            ino: identity.ino,
            kind: identity.kind,
            channel: identity.channel
          })
        )
        return Object.freeze({ status: 'started' as const })
      } catch (error) {
        if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
        const reason =
          error instanceof Error && error.message === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            ? 'permission-denied'
            : error instanceof Error &&
                (error.message === 'project-replaced' ||
                  error.message === 'PLUGIN_VSCODE_PROJECT_REPLACED')
              ? 'project-replaced'
              : 'open-failed'
        return Object.freeze({ status: 'failed' as const, reason })
      }
    },
    invalidate() {
      tokenRecords.clear()
    },
    close() {
      closed = true
      tokenRecords.clear()
    }
  }
  Object.freeze(service)
  TRUSTED_SERVICES.add(service)
  return service
}
