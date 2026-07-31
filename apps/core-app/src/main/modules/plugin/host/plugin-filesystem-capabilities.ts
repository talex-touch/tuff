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
  link(existingPath: string, newPath: string): Promise<void>
  unlink(filePath: string): Promise<void>
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

interface ApprovedPath {
  readonly path: string
  readonly parent: string
  readonly dev: number
  readonly ino: number
  readonly parentDev: number
  readonly parentIno: number
  readonly provenance: 'lifecycle' | 'transaction'
}

interface PreparedRename {
  readonly index: number
  readonly source: string
  readonly target: string
  readonly targetName: string
  readonly parent: string
  readonly parentDev: number
  readonly parentIno: number
  readonly sourceStat: Stats
  readonly unchanged: boolean
  temp: string
  state: 'source' | 'source+temp' | 'temp' | 'temp+target' | 'target'
}

const MAX_FILES = 64
const MAX_PATH_BYTES = 4_096
const MAX_TARGET_NAME_BYTES = 255
const MAX_LIFECYCLE_INPUT_BYTES = 256 * 1024
const MAX_LIFECYCLE_INPUTS = 64
const FORBIDDEN_DEVICE_PATH = /^(?:\\\\[?.]\\|\\\\)/
const WINDOWS_DEVICE_NAME =
  /^(?:con|prn|aux|nul|conin\$|conout\$|com(?:[1-9]|[¹²³])|lpt(?:[1-9]|[¹²³]))(?:\.|$)/i
const WINDOWS_INVALID_TARGET_NAME = /[<>:"|?*]/
const ALLOWED_REQUEST_KEYS = ['operation', 'entries'] as const
const ALLOWED_ENTRY_KEYS = ['source', 'targetName'] as const

const defaultFilesystem: PluginBatchRenameFilesystemAdapter = Object.freeze({
  lstat: async (filePath) => await fsp.lstat(filePath),
  realpath: async (filePath) => await fsp.realpath(filePath),
  open: async (filePath, flags) => await fsp.open(filePath, flags),
  link: async (existingPath, newPath) => await fsp.link(existingPath, newPath),
  unlink: async (filePath) => await fsp.unlink(filePath)
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

function validateSourcePath(value: unknown, platform: NodeJS.Platform): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    hasControlCharacter(value) ||
    utf8Bytes(value) > MAX_PATH_BYTES ||
    FORBIDDEN_DEVICE_PATH.test(value)
  ) {
    invalidRequest()
  }
  if (platform === 'win32') {
    if (!path.win32.isAbsolute(value) || !/^[A-Za-z]:[\\/]/.test(value)) invalidRequest()
    const remainder = value.slice(2)
    if (remainder.includes(':') || WINDOWS_INVALID_TARGET_NAME.test(remainder)) invalidRequest()
    for (const segment of remainder.split(/[\\/]+/)) {
      if (!segment) continue
      if (segment.endsWith('.') || segment.endsWith(' ') || WINDOWS_DEVICE_NAME.test(segment)) {
        invalidRequest()
      }
    }
  } else if (!path.posix.isAbsolute(value)) {
    invalidRequest()
  }
  return value
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1f) return true
  }
  return false
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
    WINDOWS_INVALID_TARGET_NAME.test(value) ||
    hasControlCharacter(value) ||
    value.endsWith('.') ||
    value.endsWith(' ') ||
    utf8Bytes(value) > MAX_TARGET_NAME_BYTES ||
    WINDOWS_DEVICE_NAME.test(value)
  ) {
    invalidRequest()
  }
  return value
}

function validateRenameRequest(value: unknown, platform: NodeJS.Platform): RenameRequest {
  const record = exactRecord(value, ALLOWED_REQUEST_KEYS)
  if (record.operation !== 'rename-batch') invalidRequest()
  const entries = snapshotArray(record.entries, MAX_FILES)
  if (entries.length === 0) invalidRequest()
  let totalBytes = 0
  const normalized = entries.map((entry) => {
    const entryRecord = exactRecord(entry, ALLOWED_ENTRY_KEYS)
    const source = validateSourcePath(
      requiredString(entryRecord, 'source', MAX_PATH_BYTES),
      platform
    )
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
    const allowed = new Set(['lstat', 'realpath', 'open', 'link', 'unlink'])
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
    link: readAdapterMethod(source, 'link'),
    unlink: readAdapterMethod(source, 'unlink')
  })
}

function isMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const descriptor = Object.getOwnPropertyDescriptor(error, 'code')
  return Boolean(descriptor && 'value' in descriptor && descriptor.value === 'ENOENT')
}

function pathIdentity(
  filePath: string,
  pathApi: typeof path.posix | typeof path.win32,
  caseFold: boolean
): string {
  const normalized = pathApi.normalize(filePath).normalize('NFC')
  return caseFold ? normalized.toLocaleLowerCase('en-US') : normalized
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
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

function extractLifecyclePaths(query: unknown, platform: NodeJS.Platform): readonly string[] {
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
        paths.push(validateSourcePath(entry, platform))
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
  const platform = options.platform
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  const caseFold = platform === 'win32' || platform === 'darwin'
  const identifyPath = (filePath: string): string => pathIdentity(filePath, pathApi, caseFold)
  const approvedPaths = new Map<string, ApprovedPath>()
  const activeOperations = new Set<Promise<unknown>>()
  const recoveryTransactions = new Set<readonly PreparedRename[]>()
  let closing = false
  let closed = false
  let failed = false
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

  const inspectCanonicalFile = async (
    filePath: string,
    provenance: ApprovedPath['provenance']
  ): Promise<{
    readonly approved: ApprovedPath
    readonly stat: Stats
    readonly parentStat: Stats
  } | null> => {
    try {
      const lexical = pathApi.resolve(validateSourcePath(filePath, platform))
      const sourceStat = await filesystem.lstat(lexical)
      if (sourceStat.isSymbolicLink() || !sourceStat.isFile() || sourceStat.nlink !== 1) return null
      const canonical = await filesystem.realpath(lexical)
      const canonicalStat = await filesystem.lstat(canonical)
      if (
        canonicalStat.isSymbolicLink() ||
        !canonicalStat.isFile() ||
        canonicalStat.nlink !== 1 ||
        !sameFileIdentity(sourceStat, canonicalStat)
      ) {
        return null
      }
      const canonicalParent = await filesystem.realpath(pathApi.dirname(canonical))
      const parentStat = await filesystem.lstat(canonicalParent)
      if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) return null
      if (sourceStat.dev !== parentStat.dev) return null
      if (pathApi.join(canonicalParent, pathApi.basename(canonical)) !== canonical) return null
      await assertNoFollowRegularFile(filesystem, canonical, canonicalStat)
      return Object.freeze({
        approved: Object.freeze({
          path: canonical,
          parent: canonicalParent,
          dev: canonicalStat.dev,
          ino: canonicalStat.ino,
          parentDev: parentStat.dev,
          parentIno: parentStat.ino,
          provenance
        }),
        stat: canonicalStat,
        parentStat
      })
    } catch {
      return null
    }
  }

  const matchesApproval = (
    inspected: NonNullable<Awaited<ReturnType<typeof inspectCanonicalFile>>>,
    approved: ApprovedPath
  ): boolean =>
    inspected.approved.path === approved.path &&
    inspected.approved.parent === approved.parent &&
    inspected.approved.dev === approved.dev &&
    inspected.approved.ino === approved.ino &&
    inspected.approved.parentDev === approved.parentDev &&
    inspected.approved.parentIno === approved.parentIno

  const assertParentCurrent = async (entry: PreparedRename): Promise<void> => {
    try {
      const canonicalParent = await filesystem.realpath(entry.parent)
      const parentStat = await filesystem.lstat(entry.parent)
      if (
        canonicalParent !== entry.parent ||
        parentStat.isSymbolicLink() ||
        !parentStat.isDirectory() ||
        parentStat.dev !== entry.parentDev ||
        parentStat.ino !== entry.parentIno
      ) {
        operationFailed('PLUGIN_FILESYSTEM_PARENT_CHANGED')
      }
    } catch {
      operationFailed('PLUGIN_FILESYSTEM_PARENT_CHANGED')
    }
  }

  const prepareRenames = async (request: RenameRequest): Promise<PreparedRename[]> => {
    const preliminary: PreparedRename[] = []
    const sourceIdentities = new Set<string>()
    const sourceFiles = new Set<string>()
    const targetIdentities = new Set<string>()
    for (let index = 0; index < request.entries.length; index += 1) {
      const entry = request.entries[index]
      const inspected = await inspectCanonicalFile(entry.source, 'lifecycle')
      const approved = inspected
        ? approvedPaths.get(identifyPath(inspected.approved.path))
        : undefined
      if (!inspected || !approved || !matchesApproval(inspected, approved)) {
        operationFailed('PLUGIN_FILESYSTEM_PATH_NOT_APPROVED')
      }
      const source = inspected.approved.path
      const parent = inspected.approved.parent
      const sourceStat = inspected.stat
      if (sourceStat.dev !== inspected.parentStat.dev) {
        operationFailed('PLUGIN_FILESYSTEM_CROSS_ROOT')
      }
      const target = pathApi.join(parent, entry.targetName)
      if (pathApi.dirname(target) !== parent || pathApi.basename(target) !== entry.targetName) {
        operationFailed('PLUGIN_FILESYSTEM_TARGET_INVALID')
      }
      const sourceIdentity = identifyPath(source)
      const targetIdentity = identifyPath(target)
      const sourceFileIdentity = `${sourceStat.dev}:${sourceStat.ino}`
      if (sourceIdentities.has(sourceIdentity) || sourceFiles.has(sourceFileIdentity)) {
        operationFailed('PLUGIN_FILESYSTEM_DUPLICATE_SOURCE')
      }
      if (targetIdentities.has(targetIdentity)) {
        operationFailed('PLUGIN_FILESYSTEM_TARGET_COLLISION')
      }
      sourceIdentities.add(sourceIdentity)
      sourceFiles.add(sourceFileIdentity)
      targetIdentities.add(targetIdentity)
      preliminary.push({
        index,
        source,
        target,
        targetName: entry.targetName,
        parent,
        parentDev: inspected.parentStat.dev,
        parentIno: inspected.parentStat.ino,
        sourceStat,
        unchanged: source === target,
        temp: '',
        state: 'source'
      })
    }

    const bySourceIdentity = new Map(
      preliminary.map((entry) => [identifyPath(entry.source), entry] as const)
    )
    for (const entry of preliminary) {
      if (entry.unchanged) continue
      try {
        const targetStat = await filesystem.lstat(entry.target)
        if (targetStat.isSymbolicLink() || targetStat.isDirectory()) {
          operationFailed('PLUGIN_FILESYSTEM_TARGET_INVALID')
        }
        const sourceEntry = bySourceIdentity.get(identifyPath(entry.target))
        if (!sourceEntry || !sameFileIdentity(sourceEntry.sourceStat, targetStat)) {
          operationFailed('PLUGIN_FILESYSTEM_TARGET_EXISTS')
        }
      } catch (error) {
        if (!isMissingError(error)) throw error
      }
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const temp = pathApi.join(entry.parent, `.tuff-rename-${randomUUID()}`)
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

  const linkWithState = async (
    entry: PreparedRename,
    source: string,
    target: string,
    nextState: PreparedRename['state']
  ): Promise<void> => {
    await filesystem.link(source, target)
    entry.state = nextState
    await assertNoFollowRegularFile(filesystem, target, entry.sourceStat)
  }

  const unlinkExpected = async (filePath: string, expected: Stats): Promise<void> => {
    await assertNoFollowRegularFile(filesystem, filePath, expected)
    await filesystem.unlink(filePath)
  }

  const rollback = async (entries: readonly PreparedRename[]): Promise<void> => {
    const errors: unknown[] = []
    for (const entry of [...entries].reverse()) {
      try {
        if (entry.state === 'target') {
          await assertParentCurrent(entry)
          await linkWithState(entry, entry.target, entry.temp, 'temp+target')
        }
        if (entry.state === 'temp+target') {
          await assertParentCurrent(entry)
          await unlinkExpected(entry.target, entry.sourceStat)
          entry.state = 'temp'
        }
      } catch (error) {
        errors.push(error)
      }
    }
    for (const entry of [...entries].reverse()) {
      try {
        if (entry.state === 'temp') {
          await assertParentCurrent(entry)
          await linkWithState(entry, entry.temp, entry.source, 'source+temp')
        }
        if (entry.state === 'source+temp') {
          await assertParentCurrent(entry)
          await unlinkExpected(entry.temp, entry.sourceStat)
          entry.state = 'source'
        }
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) operationFailed('PLUGIN_FILESYSTEM_ROLLBACK_FAILED')
  }

  const assertTransactionActive = (signal: AbortSignal): void => {
    assertActiveSignal(signal)
    assertCurrent()
    if (!permissionGranted('fs.read') || !permissionGranted('fs.write')) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    }
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
    assertTransactionActive(signal)
    const entries = await prepareRenames(request)
    const completedApprovals = new Map<PreparedRename, ApprovedPath>()
    try {
      assertTransactionActive(signal)
      for (const entry of entries) {
        if (entry.unchanged) continue
        assertTransactionActive(signal)
        await assertParentCurrent(entry)
        await assertNoFollowRegularFile(filesystem, entry.source, entry.sourceStat)
        assertTransactionActive(signal)
        await linkWithState(entry, entry.source, entry.temp, 'source+temp')
        assertTransactionActive(signal)
        await assertParentCurrent(entry)
        await unlinkExpected(entry.source, entry.sourceStat)
        entry.state = 'temp'
        assertTransactionActive(signal)
      }
      for (const entry of entries) {
        if (entry.unchanged) continue
        assertTransactionActive(signal)
        await assertParentCurrent(entry)
        await linkWithState(entry, entry.temp, entry.target, 'temp+target')
        assertTransactionActive(signal)
        await assertParentCurrent(entry)
        await unlinkExpected(entry.temp, entry.sourceStat)
        entry.state = 'target'
        assertTransactionActive(signal)
        const inspected = await inspectCanonicalFile(entry.target, 'transaction')
        if (!inspected || !sameFileIdentity(inspected.stat, entry.sourceStat)) {
          operationFailed('PLUGIN_FILESYSTEM_SOURCE_CHANGED')
        }
        completedApprovals.set(entry, inspected.approved)
        assertTransactionActive(signal)
      }
      assertTransactionActive(signal)
    } catch (error) {
      recoveryTransactions.add(entries)
      try {
        await rollback(entries)
        recoveryTransactions.delete(entries)
      } catch {
        failed = true
        operationFailed('PLUGIN_FILESYSTEM_ROLLBACK_FAILED')
      }
      throw error
    }

    for (const entry of entries) {
      if (entry.unchanged) continue
      const sourceIdentity = identifyPath(entry.source)
      const currentSourceApproval = approvedPaths.get(sourceIdentity)
      if (
        currentSourceApproval?.dev === entry.sourceStat.dev &&
        currentSourceApproval.ino === entry.sourceStat.ino
      ) {
        approvedPaths.delete(sourceIdentity)
      }
      const completed = completedApprovals.get(entry)
      if (completed) approvedPaths.set(identifyPath(entry.target), completed)
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
    validateRequest: (value) => validateRenameRequest(value, platform),
    validateResult: validateRenameResult,
    invoke(context, request, signal) {
      if (closing || closed || failed) {
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
      if (closing || closed || failed) {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
      }
      for (const [identity, approved] of approvedPaths) {
        if (approved.provenance === 'lifecycle') approvedPaths.delete(identity)
      }
      assertCurrent()
      if (!permissionGranted('fs.read')) return 0
      const paths = extractLifecyclePaths(query, platform)
      let approved = 0
      for (const filePath of paths) {
        assertCurrent()
        if (!permissionGranted('fs.read')) break
        const inspected = await inspectCanonicalFile(filePath, 'lifecycle')
        if (!inspected) continue
        approvedPaths.set(identifyPath(inspected.approved.path), inspected.approved)
        approved += 1
      }
      return approved
    },
    close(): Promise<void> {
      if (closePromise) return closePromise
      closing = true
      closePromise = Promise.resolve().then(async () => {
        await Promise.allSettled([...activeOperations])
        const recoveryErrors: unknown[] = []
        for (const entries of [...recoveryTransactions]) {
          try {
            await rollback(entries)
            recoveryTransactions.delete(entries)
          } catch (error) {
            recoveryErrors.push(error)
          }
        }
        approvedPaths.clear()
        closed = true
        if (recoveryErrors.length > 0) operationFailed('PLUGIN_FILESYSTEM_ROLLBACK_FAILED')
      })
      return closePromise
    }
  }
  return Object.freeze(api)
}
