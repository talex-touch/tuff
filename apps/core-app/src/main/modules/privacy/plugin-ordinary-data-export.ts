import type {
  PrivacyDataCategory,
  PrivacyRetentionPolicyV1
} from '@talex-touch/utils/transport/events/types'
import type { PrivacyDataOwner, PrivacyOwnerExportWriter } from './data-owner'
import type { PrivacyCategoryExporter, PrivacyExportResult } from './privacy-export'
import { constants as fsConstants } from 'node:fs'
import { lstat, open, readdir } from 'node:fs/promises'
import path from 'node:path'
import { createPrivacyDataOwnerRegistry, privacyOwnerCompletedExport } from './data-owner'
import { DEFAULT_PRIVACY_RETENTION_POLICY } from './retention-policy'

export interface PluginOrdinaryDataRow {
  readonly key: string
  readonly value: string | null
}

export interface PluginOrdinaryDataRoot {
  readonly area: 'data' | 'config'
  readonly rootPath: string
  readonly ownerRootPath?: string
  readonly excludedNames?: readonly string[]
}

export interface PluginOrdinaryDataExportRequest {
  readonly pluginId: string
  readonly rows: readonly PluginOrdinaryDataRow[]
  readonly roots: readonly PluginOrdinaryDataRoot[]
}

const CATEGORY: PrivacyDataCategory = 'plugin-data'
const FILE_CHUNK_BYTES = 128 * 1024
const MAX_DIRECTORY_ENTRIES = 100_000
const MAX_DIRECTORY_DEPTH = 32
const EXCLUDED_DIRECTORY_NAMES = new Set(['cache', 'temp', 'logs'])
const SQLITE_ARTIFACT_NAME = /\.(?:sqlite|sqlite3|db)(?:-(?:wal|shm|journal))?$/i
const LOG_ARTIFACT_NAME = /\.log(?:\.\d+)?$/i

function isExcludedOrdinaryEntry(
  root: PluginOrdinaryDataRoot,
  depth: number,
  entry: { readonly name: string; isDirectory: () => boolean; isFile: () => boolean }
): boolean {
  if (depth === 0 && root.excludedNames?.includes(entry.name)) return true
  if (entry.isDirectory()) {
    return (
      EXCLUDED_DIRECTORY_NAMES.has(entry.name) ||
      (root.area === 'data' && depth === 0 && entry.name === 'config')
    )
  }
  return (
    entry.isFile() && (SQLITE_ARTIFACT_NAME.test(entry.name) || LOG_ARTIFACT_NAME.test(entry.name))
  )
}

function emptyInspection() {
  return Object.freeze({
    ok: true as const,
    code: 'PRIVACY_OWNER_COMPLETED' as const,
    retryable: false,
    category: CATEGORY,
    itemCount: 0,
    byteCount: 0,
    retentionMs: null
  })
}

function emptyPreview() {
  return Object.freeze({
    ok: true as const,
    code: 'PRIVACY_OWNER_COMPLETED' as const,
    retryable: false,
    category: CATEGORY,
    eligibleItemCount: 0,
    eligibleByteCount: 0,
    protectedItemCount: 0,
    bounded: true
  })
}

function emptyDelete() {
  return Object.freeze({
    ok: true as const,
    code: 'PRIVACY_OWNER_COMPLETED' as const,
    retryable: false,
    category: CATEGORY,
    deletedItemCount: 0,
    deletedByteCount: 0,
    failedItemCount: 0,
    protectedItemCount: 0,
    batches: 0,
    partial: false,
    cancelled: false
  })
}

function parsePluginValue(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function containsControlCodeUnit(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit <= 0x1f || codeUnit === 0x7f) return true
  }
  return false
}

function portableRelativeName(rootPath: string, filePath: string): string {
  const relative = path.relative(rootPath, filePath)
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    relative.length > 4096 ||
    containsControlCodeUnit(relative)
  ) {
    throw new Error('PLUGIN_EXPORT_FILE_NAME_INVALID')
  }
  return relative.split(path.sep).join('/')
}

async function exportFile(
  request: PluginOrdinaryDataExportRequest,
  root: PluginOrdinaryDataRoot,
  filePath: string,
  writer: PrivacyOwnerExportWriter,
  signal: AbortSignal
): Promise<{ itemCount: number; byteCount: number }> {
  const before = await lstat(filePath)
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error('PLUGIN_EXPORT_FILE_TYPE_INVALID')
  }
  const handle = await open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  let itemCount = 0
  let byteCount = 0
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error('PLUGIN_EXPORT_FILE_CHANGED')
    }
    const buffer = Buffer.allocUnsafe(FILE_CHUNK_BYTES)
    let position = 0
    let chunkIndex = 0
    do {
      if (signal.aborted) break
      const read = await handle.read(buffer, 0, buffer.byteLength, position)
      if (read.bytesRead === 0) break
      position += read.bytesRead
      const written = await writer.write(
        Object.freeze({
          kind: 'plugin-file-chunk',
          pluginId: request.pluginId,
          area: root.area,
          name: portableRelativeName(root.rootPath, filePath),
          chunkIndex,
          encoding: 'base64url',
          bytes: buffer.subarray(0, read.bytesRead).toString('base64url')
        })
      )
      itemCount += 1
      byteCount += written.byteCount
      chunkIndex += 1
    } while (!signal.aborted)
    return { itemCount, byteCount }
  } finally {
    await handle.close()
  }
}

async function assertOwnedExportRoot(root: PluginOrdinaryDataRoot): Promise<boolean> {
  const ownerRoot = path.resolve(root.ownerRootPath ?? root.rootPath)
  const targetRoot = path.resolve(root.rootPath)
  const relative = path.relative(ownerRoot, targetRoot)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('PLUGIN_EXPORT_ROOT_INVALID')
  }

  const segments = relative === '' ? [] : relative.split(path.sep)
  let cursor = ownerRoot
  for (const segment of ['', ...segments]) {
    if (segment) cursor = path.join(cursor, segment)
    const stat = await lstat(cursor).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!stat) return false
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('PLUGIN_EXPORT_ROOT_INVALID')
    }
  }
  return true
}

async function exportRoot(
  request: PluginOrdinaryDataExportRequest,
  root: PluginOrdinaryDataRoot,
  writer: PrivacyOwnerExportWriter,
  signal: AbortSignal
): Promise<{ itemCount: number; byteCount: number }> {
  if (root.area !== 'data' && root.area !== 'config') {
    throw new Error('PLUGIN_EXPORT_AREA_INVALID')
  }
  if (!(await assertOwnedExportRoot(root))) return { itemCount: 0, byteCount: 0 }

  const queue: Array<{ directory: string; depth: number }> = [
    { directory: root.rootPath, depth: 0 }
  ]
  let scannedEntries = 0
  let itemCount = 0
  let byteCount = 0
  while (queue.length > 0 && !signal.aborted) {
    const current = queue.shift()
    if (!current) break
    if (current.depth > MAX_DIRECTORY_DEPTH) {
      throw new Error('PLUGIN_EXPORT_DIRECTORY_LIMIT')
    }
    const entries = await readdir(current.directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (isExcludedOrdinaryEntry(root, current.depth, entry)) continue
      scannedEntries += 1
      if (scannedEntries > MAX_DIRECTORY_ENTRIES) {
        throw new Error('PLUGIN_EXPORT_DIRECTORY_LIMIT')
      }
      if (signal.aborted) break
      const entryPath = path.join(current.directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error('PLUGIN_EXPORT_SYMLINK_DENIED')
      if (entry.isDirectory()) {
        queue.push({ directory: entryPath, depth: current.depth + 1 })
        continue
      }
      if (!entry.isFile()) throw new Error('PLUGIN_EXPORT_FILE_TYPE_INVALID')
      const written = await exportFile(request, root, entryPath, writer, signal)
      itemCount += written.itemCount
      byteCount += written.byteCount
    }
  }
  return { itemCount, byteCount }
}

export function createPluginOrdinaryDataOwner(
  request: PluginOrdinaryDataExportRequest
): PrivacyDataOwner {
  return Object.freeze({
    categories: Object.freeze([CATEGORY]),
    inspect: async () => emptyInspection(),
    previewDelete: async () => emptyPreview(),
    delete: async () => emptyDelete(),
    applyRetention: async (_policy: PrivacyRetentionPolicyV1) => Object.freeze([]),
    export: async (_request, writer, signal) => {
      let itemCount = 0
      let byteCount = 0
      for (const row of request.rows) {
        if (signal.aborted) break
        const written = await writer.write(
          Object.freeze({
            kind: 'plugin-kv',
            pluginId: request.pluginId,
            key: row.key,
            value: parsePluginValue(row.value)
          })
        )
        itemCount += 1
        byteCount += written.byteCount
      }
      for (const root of request.roots) {
        const written = await exportRoot(request, root, writer, signal)
        itemCount += written.itemCount
        byteCount += written.byteCount
      }
      return privacyOwnerCompletedExport(CATEGORY, {
        exportedItemCount: itemCount,
        exportedByteCount: byteCount,
        cancelled: signal.aborted,
        partial: signal.aborted
      })
    }
  })
}

export async function exportPluginOrdinaryData(
  exporter: PrivacyCategoryExporter,
  request: PluginOrdinaryDataExportRequest,
  signal?: AbortSignal
): Promise<PrivacyExportResult> {
  const ownerRegistry = createPrivacyDataOwnerRegistry([createPluginOrdinaryDataOwner(request)])
  return exporter.exportCategories(
    Object.freeze({
      categories: Object.freeze([CATEGORY]),
      policy: DEFAULT_PRIVACY_RETENTION_POLICY,
      ownerRegistry,
      ...(signal ? { signal } : {})
    }),
    signal
  )
}
