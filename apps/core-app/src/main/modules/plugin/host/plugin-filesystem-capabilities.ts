import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { constants, type Stats } from 'node:fs'
import fsp, { type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { types as utilTypes } from 'node:util'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'

export interface PluginBatchRenameFilesystemAdapter {
  lstat(filePath: string): Promise<Stats>
  realpath(filePath: string): Promise<string>
  open(filePath: string, flags: number): Promise<FileHandle>
  rename(source: string, target: string): Promise<void>
}

export interface PluginBatchRenameFilesystemCapabilityOptions {
  readonly activation: PluginActivationIdentity
  readonly platform: NodeJS.Platform
  resolveCurrentActivation(): PluginActivationIdentity | undefined
  hasPermission(pluginName: string, permissionId: 'fs.read' | 'fs.write'): boolean
  readonly filesystem?: Partial<PluginBatchRenameFilesystemAdapter>
}

export interface PluginBatchRenameFilesystemCapability {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  readonly activeOperationCount: number
  approveLifecycleFileInputs(query: unknown): Promise<number>
  close(): Promise<void>
}

interface RenameRequestEntry {
  readonly source: string
  readonly targetName: string
}

interface RenameRequest {
  readonly operation: 'rename-batch'
  readonly entries: readonly RenameRequestEntry[]
}

interface PreparedRename {
  readonly index: number
  readonly source: string
  readonly target: string
  readonly targetName: string
  readonly sourceStat: Stats
  readonly unchanged: boolean
  temp: string
  state: 'source' | 'temp' | 'target'
}

const MAX_FILES = 64
const MAX_PATH_BYTES = 4_096
const MAX_TARGET_NAME_BYTES = 255
const MAX_LIFECYCLE_INPUT_BYTES = 256 * 1024
const MAX_LIFECYCLE_INPUTS = 64
const FORBIDDEN_DEVICE_PATH = /^(?:\\\\[?.]\\|\\\\)/
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const ALLOWED_REQUEST_KEYS = ['operation', 'entries'] as const
const ALLOWED_ENTRY_KEYS = ['source', 'targetName'] as const

const defaultFilesystem: PluginBatchRenameFilesystemAdapter = Object.freeze({
  lstat: async (filePath) => await fsp.lstat(filePath),
  realpath: async (filePath) => await fsp.realpath(filePath),
  open: async (filePath, flags) => await fsp.open(filePath, flags),
  rename: async (source, target) => await fsp.rename(source, target)
})

function invalidRequest(): never {
  throw new TypeError('PLUGIN_FILESYSTEM_REQUEST_INVALID')
}

function operationFailed(code: string): never {
  throw new Error(code)
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalidRequest()
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalidRequest()
  }
  if (prototype !== Object.prototype && prototype !== null) invalidRequest()
  const allowed = new Set(keys)
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string' || !allowed.has(key))) {
    invalidRequest()
  }
  const result: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const descriptor = descriptors[key]
    if (!descriptor) continue
    if (!descriptor.enumerable || !('value' in descriptor)) invalidRequest()
    result[key] = descriptor.value
  }
  return result
}

function ownDataField(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    return undefined
  }
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key)
  } catch {
    return undefined
  }
  return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined
}

function snapshotArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) invalidRequest()
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    invalidRequest()
  }
  const lengthDescriptor = descriptors.length
  const length =
    lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > maximum) {
    invalidRequest()
  }
  const allowed = new Set<PropertyKey>(['length'])
  const result: unknown[] = []
  for (let index = 0; index < Number(length); index += 1) {
    const key = String(index)
    allowed.add(key)
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalidRequest()
    result.push(descriptor.value)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) invalidRequest()
  return result
}

function requiredString(record: Record<string, unknown>, key: string, maximum: number): string {
  if (!Object.hasOwn(record, key)) invalidRequest()
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0 || utf8Bytes(value) > maximum) {
    invalidRequest()
  }
  return value
}

function validateSourcePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    utf8Bytes(value) > MAX_PATH_BYTES ||
    FORBIDDEN_DEVICE_PATH.test(value)
  ) {
    invalidRequest()
  }
  return value
}

function validateTargetName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value === '.' ||
    value === '..' ||
    value.includes('\0') ||
    value.includes('/') ||
    value.includes('\\') ||
    value.endsWith('.') ||
    value.endsWith(' ') ||
    utf8Bytes(value) > MAX_TARGET_NAME_BYTES ||
    WINDOWS_DEVICE_NAME.test(value)
  ) {
    invalidRequest()
  }
  return value
}

function validateRenameRequest(value: unknown): RenameRequest {
  const record = exactRecord(value, ALLOWED_REQUEST_KEYS)
  if (record.operation !== 'rename-batch') invalidRequest()
  const entries = snapshotArray(record.entries, MAX_FILES)
  if (entries.length === 0) invalidRequest()
  let totalBytes = 0
  const normalized = entries.map((entry) => {
    const entryRecord = exactRecord(entry, ALLOWED_ENTRY_KEYS)
    const source = validateSourcePath(requiredString(entryRecord, 'source', MAX_PATH_BYTES))
    const targetName = validateTargetName(
      requiredString(entryRecord, 'targetName', MAX_TARGET_NAME_BYTES)
    )
    totalBytes += utf8Bytes(source) + utf8Bytes(targetName)
    if (totalBytes > MAX_LIFECYCLE_INPUT_BYTES) invalidRequest()
    return Object.freeze({ source, targetName })
  })
  return Object.freeze({ operation: 'rename-batch', entries: Object.freeze(normalized) })
}

function validateRenameResult(value: unknown): unknown {
  const record = exactRecord(value, ['operation', 'entries'])
  if (record.operation !== 'rename-batch') invalidRequest()
  const entries = snapshotArray(record.entries, MAX_FILES).map((entry) => {
    const normalized = exactRecord(entry, ['index', 'status'])
    if (
      !Number.isSafeInteger(normalized.index) ||
      Number(normalized.index) < 0 ||
      (normalized.status !== 'renamed' && normalized.status !== 'unchanged')
    ) {
      invalidRequest()
    }
    return Object.freeze({ index: Number(normalized.index), status: normalized.status })
  })
  return Object.freeze({ operation: 'rename-batch', entries: Object.freeze(entries) })
}

function snapshotActivation(value: PluginActivationIdentity): PluginActivationIdentity {
  const record = exactRecord(value, ['name', 'pluginInstanceId', 'activationGeneration', 'key'])
  const generation = record.activationGeneration
  if (!Number.isSafeInteger(generation) || Number(generation) < 1) invalidRequest()
  return Object.freeze({
    name: requiredString(record, 'name', 128),
    pluginInstanceId: requiredString(record, 'pluginInstanceId', 128),
    activationGeneration: Number(generation),
    key: requiredString(record, 'key', 256)
  })
}

function sameActivation(
  left: PluginActivationIdentity | undefined,
  right: PluginActivationIdentity
): boolean {
  return Boolean(
    left &&
    left.name === right.name &&
    left.pluginInstanceId === right.pluginInstanceId &&
    left.activationGeneration === right.activationGeneration &&
    left.key === right.key
  )
}

function readAdapterMethod<K extends keyof PluginBatchRenameFilesystemAdapter>(
  source: Partial<PluginBatchRenameFilesystemAdapter> | undefined,
  key: K
): PluginBatchRenameFilesystemAdapter[K] {
  if (!source) return defaultFilesystem[key]
  if (utilTypes.isProxy(source)) invalidRequest()
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Object.getOwnPropertyDescriptor(source, key)
  } catch {
    invalidRequest()
  }
  if (!descriptor) return defaultFilesystem[key]
  if (
    !descriptor.enumerable ||
    !('value' in descriptor) ||
    typeof descriptor.value !== 'function'
  ) {
    invalidRequest()
  }
  return descriptor.value.bind(source) as PluginBatchRenameFilesystemAdapter[K]
}

function snapshotFilesystem(
  source: Partial<PluginBatchRenameFilesystemAdapter> | undefined
): PluginBatchRenameFilesystemAdapter {
  if (source) {
    const allowed = new Set(['lstat', 'realpath', 'open', 'rename'])
    let descriptors: PropertyDescriptorMap
    try {
      descriptors = Object.getOwnPropertyDescriptors(source)
    } catch {
      invalidRequest()
    }
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string' || !allowed.has(key))) {
      invalidRequest()
    }
  }
  return Object.freeze({
    lstat: readAdapterMethod(source, 'lstat'),
    realpath: readAdapterMethod(source, 'realpath'),
    open: readAdapterMethod(source, 'open'),
    rename: readAdapterMethod(source, 'rename')
  })
}

function isMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const descriptor = Object.getOwnPropertyDescriptor(error, 'code')
  return Boolean(descriptor && 'value' in descriptor && descriptor.value === 'ENOENT')
}

function pathIdentity(filePath: string, caseFold: boolean): string {
  const normalized = path.normalize(filePath)
  return caseFold ? normalized.toLocaleLowerCase('en-US') : normalized
}

async function assertNoFollowRegularFile(
  filesystem: PluginBatchRenameFilesystemAdapter,
  filePath: string,
  expected: Stats
): Promise<void> {
  let handle: FileHandle | undefined
  try {
    handle = await filesystem.open(
      filePath,
      constants.O_RDONLY | (typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0)
    )
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== expected.dev || opened.ino !== expected.ino) {
      operationFailed('PLUGIN_FILESYSTEM_SOURCE_CHANGED')
    }
  } catch {
    operationFailed('PLUGIN_FILESYSTEM_SOURCE_INVALID')
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

function assertActiveSignal(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
  }
}

function extractLifecyclePaths(query: unknown): readonly string[] {
  const rawInputs = ownDataField(query, 'inputs')
  if (rawInputs === undefined) return Object.freeze([])
  let inputs: unknown[]
  try {
    inputs = snapshotArray(rawInputs, MAX_LIFECYCLE_INPUTS)
  } catch {
    return Object.freeze([])
  }
  const paths: string[] = []
  for (const input of inputs) {
    const type = ownDataField(input, 'type')
    const content = ownDataField(input, 'content')
    if (
      type !== 'files' ||
      typeof content !== 'string' ||
      utf8Bytes(content) > MAX_LIFECYCLE_INPUT_BYTES
    ) {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      continue
    }
    let entries: unknown[]
    try {
      entries = snapshotArray(parsed, MAX_FILES)
    } catch {
      continue
    }
    for (const entry of entries) {
      try {
        paths.push(validateSourcePath(entry))
      } catch {
        // Invalid file inputs never enter the authority registry.
      }
    }
  }
  return Object.freeze(paths)
}

export function createPluginBatchRenameFilesystemCapability(
  options: PluginBatchRenameFilesystemCapabilityOptions
): PluginBatchRenameFilesystemCapability {
  const activation = snapshotActivation(options.activation)
  if (
    typeof options.resolveCurrentActivation !== 'function' ||
    typeof options.hasPermission !== 'function' ||
    typeof options.platform !== 'string'
  ) {
    invalidRequest()
  }
  const resolveCurrentActivation = options.resolveCurrentActivation.bind(options)
  const hasPermission = options.hasPermission.bind(options)
  const filesystem = snapshotFilesystem(options.filesystem)
  const caseFold = options.platform === 'win32' || options.platform === 'darwin'
  const approvedPaths = new Set<string>()
  const activeOperations = new Set<Promise<unknown>>()
  let closing = false
  let closed = false
  let closePromise: Promise<void> | null = null

  const assertCurrent = (): void => {
    let current: PluginActivationIdentity | undefined
    try {
      current = resolveCurrentActivation()
    } catch {
      current = undefined
    }
    if (closed || !sameActivation(current, activation)) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
  }

  const permissionGranted = (permissionId: 'fs.read' | 'fs.write'): boolean => {
    try {
      return hasPermission(activation.name, permissionId) === true
    } catch {
      return false
    }
  }

  const assertContext = (context: PluginSecurityContext): void => {
    assertCurrent()
    if (!isAuthoritativePluginContext(context)) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
    const identity = context.identity
    if (
      identity.authority !== 'plugin-host' ||
      identity.pluginName !== activation.name ||
      identity.pluginInstanceId !== activation.pluginInstanceId ||
      identity.activationGeneration !== activation.activationGeneration ||
      context.uniqueKey !== activation.key ||
      !Number.isSafeInteger(identity.hostGeneration) ||
      Number(identity.hostGeneration) < 1
    ) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
  }

  const canonicalApprovedPath = async (filePath: string): Promise<string | null> => {
    try {
      const lexical = path.resolve(validateSourcePath(filePath))
      const sourceStat = await filesystem.lstat(lexical)
      if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) return null
      const canonical = await filesystem.realpath(lexical)
      const canonicalStat = await filesystem.lstat(canonical)
      if (canonicalStat.isSymbolicLink() || !canonicalStat.isFile()) return null
      const canonicalParent = await filesystem.realpath(path.dirname(canonical))
      const parentStat = await filesystem.lstat(canonicalParent)
      if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) return null
      if (sourceStat.dev !== parentStat.dev || canonicalStat.dev !== sourceStat.dev) return null
      if (path.join(canonicalParent, path.basename(canonical)) !== canonical) return null
      await assertNoFollowRegularFile(filesystem, canonical, canonicalStat)
      return canonical
    } catch {
      return null
    }
  }

  const prepareRenames = async (request: RenameRequest): Promise<PreparedRename[]> => {
    const preliminary: PreparedRename[] = []
    const sourceIdentities = new Set<string>()
    const targetIdentities = new Set<string>()
    for (let index = 0; index < request.entries.length; index += 1) {
      const entry = request.entries[index]
      const source = await canonicalApprovedPath(entry.source)
      if (!source || !approvedPaths.has(pathIdentity(source, caseFold))) {
        operationFailed('PLUGIN_FILESYSTEM_PATH_NOT_APPROVED')
      }
      const sourceStat = await filesystem.lstat(source)
      const parent = await filesystem.realpath(path.dirname(source))
      const parentStat = await filesystem.lstat(parent)
      if (
        !parentStat.isDirectory() ||
        parentStat.isSymbolicLink() ||
        sourceStat.dev !== parentStat.dev
      ) {
        operationFailed('PLUGIN_FILESYSTEM_CROSS_ROOT')
      }
      const target = path.join(parent, entry.targetName)
      if (path.dirname(target) !== parent || path.basename(target) !== entry.targetName) {
        operationFailed('PLUGIN_FILESYSTEM_TARGET_INVALID')
      }
      const sourceIdentity = pathIdentity(source, caseFold)
      const targetIdentity = pathIdentity(target, caseFold)
      if (sourceIdentities.has(sourceIdentity))
        operationFailed('PLUGIN_FILESYSTEM_DUPLICATE_SOURCE')
      if (targetIdentities.has(targetIdentity))
        operationFailed('PLUGIN_FILESYSTEM_TARGET_COLLISION')
      sourceIdentities.add(sourceIdentity)
      targetIdentities.add(targetIdentity)
      preliminary.push({
        index,
        source,
        target,
        targetName: entry.targetName,
        sourceStat,
        unchanged: source === target,
        temp: '',
        state: 'source'
      })
    }

    const bySourceIdentity = new Map(
      preliminary.map((entry) => [pathIdentity(entry.source, caseFold), entry] as const)
    )
    for (const entry of preliminary) {
      if (entry.unchanged) continue
      try {
        const targetStat = await filesystem.lstat(entry.target)
        if (targetStat.isSymbolicLink() || targetStat.isDirectory()) {
          operationFailed('PLUGIN_FILESYSTEM_TARGET_INVALID')
        }
        const sourceEntry = bySourceIdentity.get(pathIdentity(entry.target, caseFold))
        if (
          !sourceEntry ||
          sourceEntry.sourceStat.dev !== targetStat.dev ||
          sourceEntry.sourceStat.ino !== targetStat.ino
        ) {
          operationFailed('PLUGIN_FILESYSTEM_TARGET_EXISTS')
        }
      } catch (error) {
        if (!isMissingError(error)) throw error
      }
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const temp = path.join(path.dirname(entry.source), `.tuff-rename-${randomUUID()}`)
        try {
          await filesystem.lstat(temp)
        } catch (error) {
          if (isMissingError(error)) {
            entry.temp = temp
            break
          }
          throw error
        }
      }
      if (!entry.temp) operationFailed('PLUGIN_FILESYSTEM_TEMP_UNAVAILABLE')
    }
    return preliminary
  }

  const rollback = async (entries: readonly PreparedRename[]): Promise<void> => {
    const errors: unknown[] = []
    for (const entry of [...entries].reverse()) {
      if (entry.state !== 'target') continue
      try {
        await filesystem.rename(entry.target, entry.temp)
        entry.state = 'temp'
      } catch (error) {
        errors.push(error)
      }
    }
    for (const entry of [...entries].reverse()) {
      if (entry.state !== 'temp') continue
      try {
        await filesystem.rename(entry.temp, entry.source)
        entry.state = 'source'
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) operationFailed('PLUGIN_FILESYSTEM_ROLLBACK_FAILED')
  }

  const executeRenameBatch = async (
    context: PluginSecurityContext,
    request: RenameRequest,
    signal: AbortSignal
  ): Promise<unknown> => {
    assertContext(context)
    if (!permissionGranted('fs.read') || !permissionGranted('fs.write')) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    }
    assertActiveSignal(signal)
    const entries = await prepareRenames(request)
    try {
      for (const entry of entries) {
        if (entry.unchanged) continue
        assertActiveSignal(signal)
        assertCurrent()
        if (!permissionGranted('fs.read') || !permissionGranted('fs.write')) {
          throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
        }
        await assertNoFollowRegularFile(filesystem, entry.source, entry.sourceStat)
        await filesystem.rename(entry.source, entry.temp)
        entry.state = 'temp'
      }
      for (const entry of entries) {
        if (entry.unchanged) continue
        assertActiveSignal(signal)
        assertCurrent()
        if (!permissionGranted('fs.read') || !permissionGranted('fs.write')) {
          throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
        }
        await filesystem.rename(entry.temp, entry.target)
        entry.state = 'target'
      }
    } catch (error) {
      await rollback(entries)
      throw error
    }

    for (const entry of entries) {
      if (entry.unchanged) continue
      approvedPaths.delete(pathIdentity(entry.source, caseFold))
      approvedPaths.add(pathIdentity(entry.target, caseFold))
    }
    return {
      operation: 'rename-batch',
      entries: entries.map((entry) => ({
        index: entry.index,
        status: entry.unchanged ? 'unchanged' : 'renamed'
      }))
    }
  }

  const definition: PluginHostCapabilityDefinition = Object.freeze({
    id: 'filesystem.write',
    permission: 'fs.write',
    timeoutMs: 30_000,
    maxConcurrency: 1,
    validateRequest: validateRenameRequest,
    validateResult: validateRenameResult,
    invoke(context, request, signal) {
      if (closing || closed) {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
      }
      const operation = executeRenameBatch(context, request as RenameRequest, signal)
      activeOperations.add(operation)
      void operation.finally(() => activeOperations.delete(operation)).catch(() => undefined)
      return operation
    }
  })

  const api = {
    definitions: Object.freeze([definition]),
    get activeOperationCount(): number {
      return activeOperations.size
    },
    async approveLifecycleFileInputs(query: unknown): Promise<number> {
      if (closing || closed) {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
      }
      assertCurrent()
      if (!permissionGranted('fs.read')) return 0
      const paths = extractLifecyclePaths(query)
      let approved = 0
      for (const filePath of paths) {
        assertCurrent()
        if (!permissionGranted('fs.read')) break
        const canonical = await canonicalApprovedPath(filePath)
        if (!canonical) continue
        approvedPaths.add(pathIdentity(canonical, caseFold))
        approved += 1
      }
      return approved
    },
    close(): Promise<void> {
      if (closePromise) return closePromise
      closing = true
      closePromise = Promise.resolve().then(async () => {
        await Promise.allSettled([...activeOperations])
        approvedPaths.clear()
        closed = true
      })
      return closePromise
    }
  }
  return Object.freeze(api)
}
