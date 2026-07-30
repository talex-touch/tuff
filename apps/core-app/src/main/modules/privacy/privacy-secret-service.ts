import type {
  PrivacyErrorCode,
  PrivacySecretBackupPreviewResult,
  PrivacySecretBackupWriteResult,
  PrivacySecretRestoreApplyResult,
  PrivacySecretRestoreConflictPolicy,
  PrivacySecretRestorePreviewResult
} from '@talex-touch/utils/transport/events/types'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isProxy } from 'node:util/types'
import { getSecureStoreValueStrict } from '../../utils/secure-store'
import {
  applyPortableSecretRestore,
  createPortableSecretBackup,
  PORTABLE_SECRET_BACKUP_LIMITS,
  PortableSecretBackupError,
  previewPortableSecretRestore,
  type PortableSecretBackupEntry
} from './portable-secret-backup'
import {
  PORTABLE_SECRET_CATALOG_V1,
  type PortableSecretCatalogEntry
} from './portable-secret-catalog'

export interface PrivacySecretRestoreFileSnapshot {
  readonly dev: number
  readonly ino: number
  readonly size: number
  readonly mtimeMs: number
  readonly ctimeMs: number
}

export interface PrivacySecretRestoreFileReference {
  readonly filePath: string
  readonly snapshot: PrivacySecretRestoreFileSnapshot
  readonly digest: string
}

export interface PrivacySecretFileAdapter {
  writeBackup: (envelope: string, signal: AbortSignal) => Promise<{ readonly cancelled: boolean }>
  readBackup: (
    signal: AbortSignal,
    expectedFile?: PrivacySecretRestoreFileReference
  ) => Promise<
    | { readonly cancelled: true }
    | {
        readonly cancelled: false
        readonly envelope: Uint8Array
        readonly file: PrivacySecretRestoreFileReference
      }
  >
}

export interface MainPrivacySecretFileAdapterOptions {
  readonly showSaveDialog: () => Promise<{ readonly canceled: boolean; readonly filePath?: string }>
  readonly showOpenDialog: () => Promise<{
    readonly canceled: boolean
    readonly filePaths: readonly string[]
  }>
}

export interface PrivacySecretServiceOptions {
  readonly rootPath: string
  readonly files: PrivacySecretFileAdapter
  readonly now?: () => number
  readonly createRestoreId?: () => string
  readonly restorePlanTtlMs?: number
  readonly catalog?: readonly PortableSecretCatalogEntry[]
  readonly readSecret?: typeof getSecureStoreValueStrict
  readonly createBackup?: typeof createPortableSecretBackup
  readonly previewRestore?: typeof previewPortableSecretRestore
  readonly applyRestore?: typeof applyPortableSecretRestore
}

export interface PrivacySecretService {
  backupPreview: (signal?: AbortSignal) => Promise<PrivacySecretBackupPreviewResult>
  backupWrite: (password: string, signal?: AbortSignal) => Promise<PrivacySecretBackupWriteResult>
  restorePreview: (
    password: string,
    signal?: AbortSignal
  ) => Promise<PrivacySecretRestorePreviewResult>
  restoreApply: (
    restoreId: string,
    password: string,
    conflictPolicy: PrivacySecretRestoreConflictPolicy,
    signal?: AbortSignal
  ) => Promise<PrivacySecretRestoreApplyResult>
  destroy: () => Promise<void>
}

interface DirectorySnapshot {
  readonly dev: number
  readonly ino: number
}

interface RestorePlan {
  readonly id: string
  readonly expiresAt: number
  readonly file: PrivacySecretRestoreFileReference
  readonly total: number
  readonly conflicts: number
  readonly newEntries: number
  readonly storeRevision: string
  readonly fingerprints: Readonly<Record<PrivacySecretRestoreConflictPolicy, string>>
}

const RESTORE_ID = /^restore_[a-f0-9]{32}$/
const DEFAULT_RESTORE_PLAN_TTL_MS = 5 * 60_000
const MAX_RESTORE_PLAN_TTL_MS = 24 * 60 * 60_000
const SECRET_SERVICE_OPTION_KEYS = new Set([
  'rootPath',
  'files',
  'now',
  'createRestoreId',
  'restorePlanTtlMs',
  'catalog',
  'readSecret',
  'createBackup',
  'previewRestore',
  'applyRestore'
])

const SECRET_CATALOG_KEYS = new Set([
  'ownerKind',
  'ownerId',
  'key',
  'purpose',
  'secureStoreKey',
  'secureStorePurpose'
])

function exactRecord(
  value: unknown,
  allowedKeys?: ReadonlySet<string>,
  code = 'PRIVACY_SECRET_SERVICE_OPTIONS_INVALID'
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || isProxy(value))
    throw new Error(code)
  try {
    const prototype = Object.getPrototypeOf(value)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error(code)
    const result: Record<string, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = typeof key === 'string' ? descriptors[key] : undefined
      if (
        typeof key !== 'string' ||
        !descriptor ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, 'value') ||
        (allowedKeys && !allowedKeys.has(key))
      ) {
        throw new Error(code)
      }
      result[key] = descriptor.value
    }
    return result
  } catch {
    throw new Error(code)
  }
}

function exactArray(
  value: unknown,
  maximum: number,
  code = 'PRIVACY_SECRET_SERVICE_OPTIONS_INVALID'
): readonly unknown[] {
  if (!Array.isArray(value) || isProxy(value) || value.length > maximum) throw new Error(code)
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const allowedKeys = new Set<PropertyKey>(['length'])
    const result: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index)
      allowedKeys.add(key)
      const descriptor = descriptors[key]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error(code)
      result.push(descriptor.value)
    }
    if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) throw new Error(code)
    return Object.freeze(result)
  } catch {
    throw new Error(code)
  }
}

function snapshotMethod<T extends (...args: never[]) => unknown>(
  value: unknown,
  name: string,
  code: string
): T {
  const record = exactRecord(value, new Set(['writeBackup', 'readBackup']), code)
  const method = record[name]
  if (typeof method !== 'function' || isProxy(method)) throw new Error(code)
  return method.bind(value) as T
}

function snapshotFileStat(stat: Stats): PrivacySecretRestoreFileSnapshot {
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PRIVACY_SECRET_FILE_INVALID')
  return Object.freeze({
    dev: Number(stat.dev),
    ino: Number(stat.ino),
    size: Number(stat.size),
    mtimeMs: Number(stat.mtimeMs),
    ctimeMs: Number(stat.ctimeMs)
  })
}

async function readOptionalFileSnapshot(
  filePath: string
): Promise<PrivacySecretRestoreFileSnapshot | null> {
  try {
    return snapshotFileStat(await fs.lstat(filePath))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function sameFileSnapshot(
  left: PrivacySecretRestoreFileSnapshot | null,
  right: PrivacySecretRestoreFileSnapshot | null
): boolean {
  if (left === null || right === null) return left === right
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  )
}

function sameFileIdentity(
  left: PrivacySecretRestoreFileSnapshot | null,
  right: PrivacySecretRestoreFileSnapshot | null
): boolean {
  if (left === null || right === null) return left === right
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  )
}

function snapshotDirectoryStat(stat: Awaited<ReturnType<typeof fs.lstat>>): DirectorySnapshot {
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('PRIVACY_SECRET_FILE_INVALID')
  return Object.freeze({ dev: Number(stat.dev), ino: Number(stat.ino) })
}

function sameDirectorySnapshot(left: DirectorySnapshot, right: DirectorySnapshot): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function validateDialogPath(filePath: string): {
  readonly directory: string
  readonly target: string
} {
  if (filePath.length === 0 || filePath.length > 4096 || !path.isAbsolute(filePath))
    throw new Error('PRIVACY_SECRET_FILE_INVALID')
  const basename = path.basename(filePath)
  if (basename === '.' || basename === '..' || basename.length === 0)
    throw new Error('PRIVACY_SECRET_FILE_INVALID')
  return { directory: path.dirname(filePath), target: filePath }
}

function normalizeFileSnapshot(value: unknown): PrivacySecretRestoreFileSnapshot {
  const snapshot = exactRecord(
    value,
    new Set(['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']),
    'PRIVACY_SECRET_FILE_INVALID'
  )
  if (
    !Number.isSafeInteger(snapshot.dev) ||
    Number(snapshot.dev) < 0 ||
    !Number.isSafeInteger(snapshot.ino) ||
    Number(snapshot.ino) < 0 ||
    !Number.isSafeInteger(snapshot.size) ||
    Number(snapshot.size) < 1 ||
    Number(snapshot.size) > PORTABLE_SECRET_BACKUP_LIMITS.maxFileBytes ||
    typeof snapshot.mtimeMs !== 'number' ||
    !Number.isFinite(snapshot.mtimeMs) ||
    typeof snapshot.ctimeMs !== 'number' ||
    !Number.isFinite(snapshot.ctimeMs)
  ) {
    throw new Error('PRIVACY_SECRET_FILE_INVALID')
  }
  return Object.freeze({
    dev: Number(snapshot.dev),
    ino: Number(snapshot.ino),
    size: Number(snapshot.size),
    mtimeMs: snapshot.mtimeMs,
    ctimeMs: snapshot.ctimeMs
  })
}

function normalizeRestoreFileReference(value: unknown): PrivacySecretRestoreFileReference {
  const reference = exactRecord(
    value,
    new Set(['filePath', 'snapshot', 'digest']),
    'PRIVACY_SECRET_FILE_INVALID'
  )
  if (
    typeof reference.filePath !== 'string' ||
    typeof reference.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(reference.digest)
  ) {
    throw new Error('PRIVACY_SECRET_FILE_INVALID')
  }
  const selected = validateDialogPath(reference.filePath)
  return Object.freeze({
    filePath: selected.target,
    snapshot: normalizeFileSnapshot(reference.snapshot),
    digest: reference.digest
  })
}

function sameRestoreFileReference(
  left: PrivacySecretRestoreFileReference,
  right: PrivacySecretRestoreFileReference
): boolean {
  return (
    left.filePath === right.filePath &&
    left.digest === right.digest &&
    sameFileSnapshot(left.snapshot, right.snapshot)
  )
}

async function readBoundedBackupFile(
  filePath: string,
  signal: AbortSignal,
  expected?: PrivacySecretRestoreFileReference
): Promise<{
  readonly cancelled: false
  readonly envelope: Uint8Array
  readonly file: PrivacySecretRestoreFileReference
}> {
  const mismatchCode = expected
    ? 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
    : 'PRIVACY_SECRET_FILE_TARGET_CHANGED'
  const before = snapshotFileStat(await fs.lstat(filePath))
  if (before.size < 1 || before.size > PORTABLE_SECRET_BACKUP_LIMITS.maxFileBytes)
    throw new Error('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')
  if (expected && !sameFileSnapshot(expected.snapshot, before)) throw new Error(mismatchCode)

  const handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  let envelope: Buffer | undefined
  try {
    const opened = snapshotFileStat(await handle.stat())
    if (!sameFileSnapshot(before, opened)) throw new Error(mismatchCode)
    envelope = Buffer.allocUnsafe(opened.size)
    let offset = 0
    while (offset < envelope.byteLength) {
      if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
      const { bytesRead } = await handle.read(
        envelope,
        offset,
        envelope.byteLength - offset,
        offset
      )
      if (bytesRead === 0) throw new Error(mismatchCode)
      offset += bytesRead
    }
    const extra = Buffer.allocUnsafe(1)
    try {
      const { bytesRead } = await handle.read(extra, 0, 1, envelope.byteLength)
      if (bytesRead !== 0) throw new Error(mismatchCode)
    } finally {
      extra.fill(0)
    }
    const after = snapshotFileStat(await handle.stat())
    if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
    if (!sameFileSnapshot(opened, after)) throw new Error(mismatchCode)

    const file = Object.freeze({
      filePath,
      snapshot: after,
      digest: createHash('sha256').update(envelope).digest('hex')
    })
    if (expected && !sameRestoreFileReference(expected, file)) throw new Error(mismatchCode)
    return Object.freeze({ cancelled: false as const, envelope, file })
  } catch (error) {
    envelope?.fill(0)
    throw error
  } finally {
    await handle.close()
  }
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await fs.open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('PRIVACY_OPERATION_CANCELLED'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('PRIVACY_OPERATION_CANCELLED'))
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

export function createMainPrivacySecretFileAdapter(
  options: MainPrivacySecretFileAdapterOptions
): PrivacySecretFileAdapter {
  const values = exactRecord(options, new Set(['showSaveDialog', 'showOpenDialog']))
  if (
    typeof values.showSaveDialog !== 'function' ||
    isProxy(values.showSaveDialog) ||
    typeof values.showOpenDialog !== 'function' ||
    isProxy(values.showOpenDialog)
  ) {
    throw new Error('PRIVACY_SECRET_FILE_OPTIONS_INVALID')
  }
  const showSaveDialog = (
    values.showSaveDialog as MainPrivacySecretFileAdapterOptions['showSaveDialog']
  ).bind(options)
  const showOpenDialog = (
    values.showOpenDialog as MainPrivacySecretFileAdapterOptions['showOpenDialog']
  ).bind(options)

  return Object.freeze({
    writeBackup: async (envelope, signal) => {
      if (
        typeof envelope !== 'string' ||
        Buffer.byteLength(envelope, 'utf8') > PORTABLE_SECRET_BACKUP_LIMITS.maxFileBytes
      ) {
        throw new Error('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')
      }
      if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
      const rawDialog = exactRecord(
        await abortable(showSaveDialog(), signal),
        new Set(['canceled', 'filePath']),
        'PRIVACY_SECRET_FILE_INVALID'
      )
      if (typeof rawDialog.canceled !== 'boolean') throw new Error('PRIVACY_SECRET_FILE_INVALID')
      if (rawDialog.canceled) return Object.freeze({ cancelled: true })
      if (typeof rawDialog.filePath !== 'string') throw new Error('PRIVACY_SECRET_FILE_INVALID')
      if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')

      const selected = validateDialogPath(rawDialog.filePath)
      const directory = await fs.realpath(selected.directory)
      const directorySnapshot = snapshotDirectoryStat(await fs.lstat(directory))
      const target = path.join(directory, path.basename(selected.target))
      const initialTarget = await readOptionalFileSnapshot(target)
      const temporary = path.join(directory, `.${path.basename(target)}.${randomUUID()}.tmp`)
      const recovery = path.join(directory, `.${path.basename(target)}.${randomUUID()}.recovery`)
      let handle: Awaited<ReturnType<typeof fs.open>> | undefined
      let linkedTargetSnapshot: PrivacySecretRestoreFileSnapshot | null = null
      let recoverySnapshot: PrivacySecretRestoreFileSnapshot | null = null
      let targetArchived = false
      let finalized = false
      try {
        handle = await fs.open(temporary, 'wx', 0o600)
        if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
        await handle.writeFile(envelope, 'utf8')
        await handle.sync()
        const openedTemporary = snapshotFileStat(await handle.stat())
        await handle.close()
        handle = undefined
        if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
        const namedTemporary = await readOptionalFileSnapshot(temporary)
        if (!sameFileSnapshot(openedTemporary, namedTemporary))
          throw new Error('PRIVACY_SECRET_FILE_TARGET_CHANGED')
        const currentDirectory = await fs.realpath(selected.directory)
        if (
          currentDirectory !== directory ||
          !sameDirectorySnapshot(
            directorySnapshot,
            snapshotDirectoryStat(await fs.lstat(directory))
          )
        ) {
          throw new Error('PRIVACY_SECRET_FILE_TARGET_CHANGED')
        }
        const currentTarget = await readOptionalFileSnapshot(target)
        if (!sameFileSnapshot(initialTarget, currentTarget))
          throw new Error('PRIVACY_SECRET_FILE_TARGET_CHANGED')
        if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
        if (initialTarget !== null) {
          await fs.rename(target, recovery)
          targetArchived = true
          const archivedTarget = await readOptionalFileSnapshot(recovery)
          if (!sameFileIdentity(initialTarget, archivedTarget)) {
            throw new Error('PRIVACY_SECRET_FILE_TARGET_CHANGED')
          }
          recoverySnapshot = archivedTarget
          if ((await readOptionalFileSnapshot(target)) !== null) {
            throw new Error('PRIVACY_SECRET_FILE_TARGET_CHANGED')
          }
        }
        await fs.link(temporary, target)
        const linkedTemporary = await readOptionalFileSnapshot(temporary)
        const linkedTarget = await readOptionalFileSnapshot(target)
        if (!sameFileSnapshot(linkedTemporary, linkedTarget)) {
          throw new Error('PRIVACY_SECRET_FILE_TARGET_CHANGED')
        }
        linkedTargetSnapshot = linkedTarget
        await fs.rm(temporary)
        const committedTarget = await readOptionalFileSnapshot(target)
        if (!sameFileIdentity(linkedTarget, committedTarget)) {
          throw new Error('PRIVACY_SECRET_FILE_TARGET_CHANGED')
        }
        linkedTargetSnapshot = committedTarget
        await syncDirectory(directory)
        if (targetArchived) {
          const durableTarget = await readOptionalFileSnapshot(target)
          if (!sameFileIdentity(committedTarget, durableTarget)) {
            throw new Error('PRIVACY_SECRET_FILE_TARGET_CHANGED')
          }
          await fs.rm(recovery)
          targetArchived = false
          finalized = true
          await syncDirectory(directory)
        } else {
          finalized = true
        }
        return Object.freeze({ cancelled: false })
      } catch (error) {
        let cleanupError: unknown
        if (linkedTargetSnapshot && !finalized) {
          const currentTarget = await readOptionalFileSnapshot(target).catch(() => null)
          if (sameFileIdentity(linkedTargetSnapshot, currentTarget)) {
            try {
              await fs.rm(target)
            } catch (failure) {
              cleanupError = failure
            }
          }
        }
        if (targetArchived && recoverySnapshot) {
          try {
            const archivedTarget = await readOptionalFileSnapshot(recovery)
            if (!sameFileIdentity(recoverySnapshot, archivedTarget)) {
              throw new Error('PRIVACY_SECRET_FILE_RECOVERY_FAILED')
            }
            if ((await readOptionalFileSnapshot(target)) !== null) {
              throw new Error('PRIVACY_SECRET_FILE_RECOVERY_REQUIRED')
            }
            await fs.link(recovery, target)
            const restoredTarget = await readOptionalFileSnapshot(target)
            if (!sameFileIdentity(archivedTarget, restoredTarget)) {
              throw new Error('PRIVACY_SECRET_FILE_RECOVERY_FAILED')
            }
            await fs.rm(recovery)
            targetArchived = false
          } catch (failure) {
            cleanupError ??= failure
          }
        }
        await syncDirectory(directory).catch((failure: unknown) => {
          cleanupError ??= failure
        })
        if (cleanupError !== undefined) {
          throw new AggregateError([error, cleanupError], 'PRIVACY_SECRET_FILE_RECOVERY_FAILED')
        }
        throw error
      } finally {
        await handle?.close().catch(() => undefined)
        await fs.rm(temporary, { force: true }).catch(() => undefined)
      }
    },

    readBackup: async (signal, expectedFile) => {
      if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
      const expected =
        expectedFile === undefined ? undefined : normalizeRestoreFileReference(expectedFile)
      let selectedPath = expected?.filePath
      if (!selectedPath) {
        const rawDialog = exactRecord(
          await abortable(showOpenDialog(), signal),
          new Set(['canceled', 'filePaths']),
          'PRIVACY_SECRET_FILE_INVALID'
        )
        const filePaths = exactArray(rawDialog.filePaths, 1, 'PRIVACY_SECRET_FILE_INVALID')
        if (typeof rawDialog.canceled !== 'boolean') throw new Error('PRIVACY_SECRET_FILE_INVALID')
        if (rawDialog.canceled) return Object.freeze({ cancelled: true as const })
        if (filePaths.length !== 1 || typeof filePaths[0] !== 'string')
          throw new Error('PRIVACY_SECRET_FILE_INVALID')
        selectedPath = filePaths[0]
      }
      if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')

      const selected = validateDialogPath(selectedPath)
      return readBoundedBackupFile(selected.target, signal, expected)
    }
  })
}

function failure(code: PrivacyErrorCode, retryable = false) {
  return Object.freeze({ ok: false as const, code, retryable })
}

function cancelledFailure() {
  return Object.freeze({
    ok: false as const,
    code: 'PRIVACY_OPERATION_CANCELLED' as const,
    retryable: false,
    cancelled: true
  })
}

function privacyError(error: unknown, fallback: PrivacyErrorCode): PrivacyErrorCode {
  if (error instanceof PortableSecretBackupError) return error.code
  if (error instanceof Error && error.message === 'PRIVACY_OPERATION_CANCELLED') {
    return 'PRIVACY_OPERATION_CANCELLED'
  }
  if (error instanceof Error && error.message === 'PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED') {
    return 'PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED'
  }
  if (error instanceof Error && error.message === 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID') {
    return 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
  }
  return fallback
}

function normalizeRestorePreview(
  value: unknown
): Awaited<ReturnType<typeof previewPortableSecretRestore>> {
  const preview = exactRecord(
    value,
    new Set(['total', 'conflicts', 'newEntries', 'storeRevision', 'planFingerprints']),
    'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
  )
  const fingerprints = exactRecord(
    preview.planFingerprints,
    new Set(['skip', 'overwrite']),
    'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
  )
  if (
    !Number.isSafeInteger(preview.total) ||
    Number(preview.total) < 0 ||
    Number(preview.total) > PORTABLE_SECRET_BACKUP_LIMITS.maxEntries ||
    !Number.isSafeInteger(preview.conflicts) ||
    Number(preview.conflicts) < 0 ||
    Number(preview.conflicts) > Number(preview.total) ||
    !Number.isSafeInteger(preview.newEntries) ||
    Number(preview.newEntries) !== Number(preview.total) - Number(preview.conflicts) ||
    typeof preview.storeRevision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(preview.storeRevision) ||
    typeof fingerprints.skip !== 'string' ||
    !/^[a-f0-9]{64}$/.test(fingerprints.skip) ||
    typeof fingerprints.overwrite !== 'string' ||
    !/^[a-f0-9]{64}$/.test(fingerprints.overwrite)
  ) {
    throw new Error('PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID')
  }
  return Object.freeze({
    total: Number(preview.total),
    conflicts: Number(preview.conflicts),
    newEntries: Number(preview.newEntries),
    storeRevision: preview.storeRevision,
    planFingerprints: Object.freeze({
      skip: fingerprints.skip,
      overwrite: fingerprints.overwrite
    })
  })
}

function sameRestorePlan(
  expected: RestorePlan,
  current: Awaited<ReturnType<typeof previewPortableSecretRestore>>
): boolean {
  return (
    expected.total === current.total &&
    expected.conflicts === current.conflicts &&
    expected.newEntries === current.newEntries &&
    expected.storeRevision === current.storeRevision &&
    expected.fingerprints.skip === current.planFingerprints.skip &&
    expected.fingerprints.overwrite === current.planFingerprints.overwrite
  )
}

export function createPrivacySecretService(
  options: PrivacySecretServiceOptions
): PrivacySecretService {
  const values = exactRecord(options, SECRET_SERVICE_OPTION_KEYS)
  if (typeof values.rootPath !== 'string' || values.rootPath.length === 0)
    throw new Error('PRIVACY_SECRET_SERVICE_OPTIONS_INVALID')
  const rootPath = values.rootPath
  const writeBackup = snapshotMethod<PrivacySecretFileAdapter['writeBackup']>(
    values.files,
    'writeBackup',
    'PRIVACY_SECRET_SERVICE_OPTIONS_INVALID'
  )
  const readBackup = snapshotMethod<PrivacySecretFileAdapter['readBackup']>(
    values.files,
    'readBackup',
    'PRIVACY_SECRET_SERVICE_OPTIONS_INVALID'
  )
  const now = values.now === undefined ? Date.now : values.now
  const createRestoreId =
    values.createRestoreId === undefined
      ? () => `restore_${randomUUID().replaceAll('-', '')}`
      : values.createRestoreId
  const restorePlanTtlMs = values.restorePlanTtlMs ?? DEFAULT_RESTORE_PLAN_TTL_MS
  const catalog = values.catalog ?? PORTABLE_SECRET_CATALOG_V1
  const readSecret = values.readSecret ?? getSecureStoreValueStrict
  const createBackup = values.createBackup ?? createPortableSecretBackup
  const previewRestore = values.previewRestore ?? previewPortableSecretRestore
  const applyRestore = values.applyRestore ?? applyPortableSecretRestore

  for (const candidate of [
    now,
    createRestoreId,
    readSecret,
    createBackup,
    previewRestore,
    applyRestore
  ]) {
    if (typeof candidate !== 'function' || isProxy(candidate))
      throw new Error('PRIVACY_SECRET_SERVICE_OPTIONS_INVALID')
  }
  if (
    !Number.isSafeInteger(restorePlanTtlMs) ||
    Number(restorePlanTtlMs) < 1_000 ||
    Number(restorePlanTtlMs) > MAX_RESTORE_PLAN_TTL_MS
  ) {
    throw new Error('PRIVACY_SECRET_SERVICE_OPTIONS_INVALID')
  }
  const catalogValues = exactArray(catalog, PORTABLE_SECRET_BACKUP_LIMITS.maxEntries)
  const catalogSnapshot = Object.freeze(
    catalogValues.map((candidate) => {
      const entry = exactRecord(candidate, SECRET_CATALOG_KEYS)
      if (
        (entry.ownerKind !== 'plugin' && entry.ownerKind !== 'provider') ||
        !['ownerId', 'key', 'purpose', 'secureStoreKey', 'secureStorePurpose'].every(
          (key) => typeof entry[key] === 'string' && (entry[key] as string).length > 0
        )
      ) {
        throw new Error('PRIVACY_SECRET_SERVICE_OPTIONS_INVALID')
      }
      return Object.freeze({
        ownerKind: entry.ownerKind,
        ownerId: entry.ownerId,
        key: entry.key,
        purpose: entry.purpose,
        secureStoreKey: entry.secureStoreKey,
        secureStorePurpose: entry.secureStorePurpose
      }) as PortableSecretCatalogEntry
    })
  )

  const operationNow = (): number => {
    const value = (now as () => number)()
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('PRIVACY_SECRET_SERVICE_CLOCK_INVALID')
    return value
  }

  let closing = false
  let plan: RestorePlan | null = null
  let planExpiryTimer: ReturnType<typeof setTimeout> | null = null
  let tail: Promise<unknown> = Promise.resolve()
  const operationControllers = new Set<AbortController>()

  const clearPlan = (): void => {
    if (planExpiryTimer) clearTimeout(planExpiryTimer)
    planExpiryTimer = null
    plan = null
  }
  const schedulePlanExpiry = (candidate: RestorePlan): void => {
    const delay = Math.max(1, candidate.expiresAt - operationNow())
    planExpiryTimer = setTimeout(() => {
      if (plan === candidate) clearPlan()
    }, delay)
    planExpiryTimer.unref?.()
  }
  const serialize = <T>(
    externalSignal: AbortSignal | undefined,
    work: (signal: AbortSignal) => Promise<T>
  ): Promise<T> => {
    if (closing || externalSignal?.aborted) return Promise.resolve(cancelledFailure() as T)
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort(externalSignal?.reason)
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true })
    if (externalSignal?.aborted) controller.abort(externalSignal.reason)
    operationControllers.add(controller)

    const run = async (): Promise<T> => {
      try {
        if (controller.signal.aborted) return cancelledFailure() as T
        return await work(controller.signal)
      } finally {
        operationControllers.delete(controller)
        externalSignal?.removeEventListener('abort', onExternalAbort)
      }
    }
    const operation = tail.then(run, run)
    tail = operation.catch(() => undefined)
    return operation
  }
  const loadEntries = async (signal: AbortSignal) => {
    const entries: PortableSecretBackupEntry[] = []
    for (const entry of catalogSnapshot) {
      if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
      const value = await (readSecret as typeof getSecureStoreValueStrict)(
        rootPath,
        entry.secureStoreKey,
        entry.secureStorePurpose
      )
      if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
      if (value !== null) {
        entries.push(
          Object.freeze({
            ownerKind: entry.ownerKind,
            ownerId: entry.ownerId,
            key: entry.key,
            purpose: entry.purpose,
            value
          })
        )
      }
    }
    return Object.freeze(entries)
  }

  return Object.freeze({
    backupPreview: (externalSignal) =>
      serialize(externalSignal, async (signal) => {
        try {
          const entries = await loadEntries(signal)
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({
              portableEntryCount: entries.length,
              available: entries.length > 0
            })
          })
        } catch (error) {
          const code = privacyError(error, 'PRIVACY_SECRET_BACKUP_STORE_UNAVAILABLE')
          return code === 'PRIVACY_OPERATION_CANCELLED' ? cancelledFailure() : failure(code, true)
        }
      }),

    backupWrite: (password, externalSignal) =>
      serialize(externalSignal, async (signal) => {
        try {
          const entries = await loadEntries(signal)
          if (entries.length === 0) return failure('PRIVACY_CATEGORY_UNAVAILABLE')
          const envelope = await (createBackup as typeof createPortableSecretBackup)(
            entries,
            password
          )
          if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
          const result = await writeBackup(envelope, signal)
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({
              format: 'talex.touch.secret-backup' as const,
              version: 1 as const,
              cancelled: result.cancelled
            })
          })
        } catch (error) {
          const code = privacyError(error, 'PRIVACY_SECRET_BACKUP_STORE_WRITE_FAILED')
          return code === 'PRIVACY_OPERATION_CANCELLED'
            ? cancelledFailure()
            : failure(code, code === 'PRIVACY_SECRET_BACKUP_STORE_WRITE_FAILED')
        }
      }),

    restorePreview: (password, externalSignal) =>
      serialize(externalSignal, async (signal) => {
        let selectedEnvelope: Uint8Array | undefined
        try {
          const selected = await readBackup(signal)
          if (selected.cancelled) return cancelledFailure()
          selectedEnvelope = selected.envelope
          const preview = normalizeRestorePreview(
            await (previewRestore as typeof previewPortableSecretRestore)(
              rootPath,
              selectedEnvelope,
              password
            )
          )
          if (signal.aborted) throw new Error('PRIVACY_OPERATION_CANCELLED')
          const restoreId = (createRestoreId as () => string)()
          if (!RESTORE_ID.test(restoreId))
            throw new Error('PRIVACY_SECRET_SERVICE_RESTORE_ID_INVALID')
          clearPlan()
          const candidate = Object.freeze({
            id: restoreId,
            expiresAt: operationNow() + Number(restorePlanTtlMs),
            file: normalizeRestoreFileReference(selected.file),
            total: preview.total,
            conflicts: preview.conflicts,
            newEntries: preview.newEntries,
            storeRevision: preview.storeRevision,
            fingerprints: preview.planFingerprints
          })
          plan = candidate
          schedulePlanExpiry(candidate)
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({
              restoreId,
              totalEntryCount: preview.total,
              conflictCount: preview.conflicts,
              newEntryCount: preview.newEntries
            })
          })
        } catch (error) {
          const code = privacyError(error, 'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID')
          return code === 'PRIVACY_OPERATION_CANCELLED'
            ? cancelledFailure()
            : failure(code, code === 'PRIVACY_SECRET_BACKUP_STORE_UNAVAILABLE')
        } finally {
          selectedEnvelope?.fill(0)
        }
      }),

    restoreApply: (restoreId, password, conflictPolicy, externalSignal) =>
      serialize(externalSignal, async (signal) => {
        const current = plan
        if (!current || current.id !== restoreId) {
          return failure('PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID')
        }
        if (
          current.expiresAt <= operationNow() ||
          (conflictPolicy !== 'skip' && conflictPolicy !== 'overwrite')
        ) {
          clearPlan()
          return failure('PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID')
        }
        if (signal.aborted) return cancelledFailure()
        if (planExpiryTimer) clearTimeout(planExpiryTimer)
        planExpiryTimer = null
        plan = null
        let selectedEnvelope: Uint8Array | undefined
        try {
          const selected = await readBackup(signal, current.file)
          if (selected.cancelled) {
            return failure('PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID')
          }
          selectedEnvelope = selected.envelope
          const selectedFile = normalizeRestoreFileReference(selected.file)
          if (!sameRestoreFileReference(current.file, selectedFile)) {
            return failure('PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID')
          }
          const preview = normalizeRestorePreview(
            await (previewRestore as typeof previewPortableSecretRestore)(
              rootPath,
              selectedEnvelope,
              password
            )
          )
          if (signal.aborted) return cancelledFailure()
          if (!sameRestorePlan(current, preview)) {
            return failure('PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID')
          }
          const result = await (applyRestore as typeof applyPortableSecretRestore)(
            rootPath,
            selectedEnvelope,
            password,
            conflictPolicy,
            preview.planFingerprints[conflictPolicy]
          )
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({
              importedCount: result.imported,
              overwrittenCount: result.overwritten,
              skippedCount: result.skipped
            })
          })
        } catch (error) {
          const code = privacyError(error, 'PRIVACY_SECRET_BACKUP_STORE_WRITE_FAILED')
          if (code === 'PRIVACY_OPERATION_CANCELLED') return cancelledFailure()
          return failure(
            code,
            code === 'PRIVACY_SECRET_BACKUP_STORE_WRITE_FAILED' ||
              code === 'PRIVACY_SECRET_BACKUP_STORE_UNAVAILABLE'
          )
        } finally {
          selectedEnvelope?.fill(0)
        }
      }),

    destroy: async () => {
      closing = true
      for (const controller of operationControllers) {
        controller.abort(new Error('PRIVACY_SECRET_SERVICE_DESTROYED'))
      }
      await tail.catch(() => undefined)
      clearPlan()
    }
  })
}
