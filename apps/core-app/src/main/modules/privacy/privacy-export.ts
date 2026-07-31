import type {
  PrivacyCategoryExportSummary,
  PrivacyDataCategory,
  PrivacyRetentionPolicyV1
} from '@talex-touch/utils/transport/events/types'
import type { WriteStream } from 'node:fs'
import type { PrivacyDataOwnerRegistry, PrivacyOwnerExportWriter } from './data-owner'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { isProxy } from 'node:util/types'
import {
  normalizePrivacyResult,
  PRIVACY_DATA_CATEGORIES
} from '@talex-touch/utils/transport/events/types'
import { normalizePrivacyOwnerExportResult } from './data-owner'

export interface PrivacyExportLimits {
  readonly maxRecordBytes: number
  readonly maxCategoryBytes: number
  readonly maxCategoryRecords: number
  readonly maxTotalBytes: number
  readonly maxTotalRecords: number
}

export interface PrivacyExportRequest {
  readonly categories: readonly PrivacyDataCategory[]
  readonly policy: PrivacyRetentionPolicyV1
  readonly ownerRegistry: PrivacyDataOwnerRegistry
  readonly signal?: AbortSignal
}

export interface PrivacyExportResult extends PrivacyCategoryExportSummary {}

interface SaveDialogResult {
  readonly canceled: boolean
  readonly filePath?: string
}

interface ExportStream {
  readonly write: WriteStream['write']
  readonly end: WriteStream['end']
  readonly destroy: WriteStream['destroy']
  readonly once: WriteStream['once']
  readonly removeListener: WriteStream['removeListener']
}

interface ExportTempFile {
  readonly stream: ExportStream
  sync: () => Promise<void>
  stat: () => Promise<PrivacyExportTargetSnapshot>
  close: () => Promise<void>
}

export interface PrivacyCategoryExporterOptions {
  readonly showSaveDialog: () => Promise<SaveDialogResult>
  readonly now?: () => number
  readonly createReportId?: () => string
  readonly createStream?: (
    filePath: string,
    options: { readonly flags: 'wx'; readonly mode: number }
  ) => ExportStream
  readonly openTempFile?: (
    filePath: string,
    options: { readonly flags: 'wx'; readonly mode: number }
  ) => Promise<ExportTempFile>
  readonly syncFile?: (filePath: string) => Promise<void>
  readonly renameFile?: (from: string, to: string) => Promise<void>
  readonly linkFile?: (from: string, to: string) => Promise<void>
  readonly removeFile?: (filePath: string) => Promise<void>
  readonly realpathDirectory?: (directory: string) => Promise<string>
  readonly lstatTarget?: (filePath: string) => Promise<PrivacyExportTargetSnapshot | null>
  readonly syncDirectory?: (directory: string) => Promise<void>
  readonly limits?: Partial<PrivacyExportLimits>
}

interface PrivacyExportTargetSnapshot {
  readonly dev: number
  readonly ino: number
  readonly size: number
  readonly mtimeMs: number
  readonly ctimeMs: number
}

interface PrivacyExportDirectorySnapshot {
  readonly dev: number
  readonly ino: number
}

export interface PrivacyCategoryExporter {
  exportCategories: (
    request: PrivacyExportRequest,
    signal?: AbortSignal
  ) => Promise<PrivacyExportResult>
}

const EXPORT_FORMAT = 'talex.touch.privacy-export/v1' as const
const DEFAULT_LIMITS: PrivacyExportLimits = Object.freeze({
  maxRecordBytes: 256 * 1024,
  maxCategoryBytes: 64 * 1024 * 1024,
  maxCategoryRecords: 100_000,
  maxTotalBytes: 256 * 1024 * 1024,
  maxTotalRecords: 400_000
})
const OPTION_KEYS = new Set([
  'showSaveDialog',
  'now',
  'createReportId',
  'createStream',
  'openTempFile',
  'syncFile',
  'renameFile',
  'linkFile',
  'removeFile',
  'realpathDirectory',
  'lstatTarget',
  'syncDirectory',
  'limits'
])
const LIMIT_KEYS = new Set(Object.keys(DEFAULT_LIMITS))
const FORBIDDEN_KEY =
  /secret|password|credential|api.?key|private.?key|access.?token|auth.?token|refresh.?token|path|sql|endpoint|native|stack|error|request|response|payload|image|audio|query|prompt|content|text|summary|objective|vector|embedding/i
const EXPORT_RECORD_FIELDS: Readonly<
  Record<PrivacyDataCategory, Readonly<Record<string, ReadonlySet<string>>>>
> = Object.freeze({
  'clipboard-history': Object.freeze({
    'clipboard-record': new Set(['kind', 'id', 'type', 'createdAt', 'favorite', 'important'])
  }),
  'ocr-screenshot-temp': Object.freeze({
    'ocr-job-metadata': new Set(['kind', 'jobId', 'status', 'queuedAt', 'finishedAt'])
  }),
  'search-history': Object.freeze({
    'query-completion': new Set(['kind', 'completionCount', 'lastCompletedAt']),
    'search-usage': new Set(['kind', 'action', 'sourceType', 'createdAt']),
    'usage-summary': new Set(['kind', 'executeCount', 'lastUsedAt']),
    'item-usage': new Set([
      'kind',
      'sourceType',
      'searchCount',
      'executeCount',
      'cancelCount',
      'lastSearchedAt',
      'lastExecutedAt',
      'lastCancelledAt',
      'updatedAt'
    ]),
    'item-time-usage': new Set(['kind', 'updatedAt']),
    'usage-trend': new Set(['kind', 'day', 'executeCount'])
  }),
  'intelligence-audit': Object.freeze({
    'intelligence-audit-metadata': new Set([
      'kind',
      'createdAt',
      'capabilityId',
      'providerId',
      'modelId',
      'callerId',
      'promptTokens',
      'completionTokens',
      'totalTokens',
      'estimatedCost',
      'latencyMs',
      'success'
    ])
  }),
  'intelligence-context': Object.freeze({
    'intelligence-context-session': new Set([
      'kind',
      'sessionId',
      'owner',
      'status',
      'createdAt',
      'updatedAt',
      'archivedAt',
      'pinned'
    ]),
    'intelligence-context-turn': new Set([
      'kind',
      'turnId',
      'sessionId',
      'role',
      'privacyLevel',
      'tokenEstimate',
      'createdAt'
    ])
  }),
  diagnostics: Object.freeze({
    'analytics-snapshot-metadata': new Set(['kind', 'windowType', 'createdAt']),
    'plugin-analytics-metadata': new Set([
      'kind',
      'pluginId',
      'pluginVersion',
      'featureId',
      'eventType',
      'count',
      'createdAt'
    ]),
    'analytics-queue-metadata': new Set(['kind', 'createdAt', 'retryCount', 'lastAttemptAt']),
    'telemetry-upload-metadata': new Set([
      'kind',
      'searchCount',
      'totalUploads',
      'failedUploads',
      'lastUploadAt',
      'lastFailureAt',
      'updatedAt'
    ])
  }),
  'intelligence-memory': Object.freeze({}),
  'plugin-data': Object.freeze({
    'plugin-kv': new Set(['kind', 'pluginId', 'key', 'value']),
    'plugin-file-chunk': new Set([
      'kind',
      'pluginId',
      'area',
      'name',
      'chunkIndex',
      'encoding',
      'bytes'
    ])
  })
})
const REPORT_ID = /^\w[\w.:-]{7,127}$/
const DATA_CATEGORY_SET = new Set<string>(PRIVACY_DATA_CATEGORIES)

function snapshotRecord(
  value: unknown,
  allowedKeys?: ReadonlySet<string>
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || isProxy(value)) {
    throw new Error('PRIVACY_EXPORT_INVALID_DEPENDENCY')
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('PRIVACY_EXPORT_INVALID_DEPENDENCY')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const result: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (
      typeof key !== 'string' ||
      key === '__proto__' ||
      key === 'prototype' ||
      key === 'constructor'
    ) {
      throw new Error('PRIVACY_EXPORT_INVALID_DEPENDENCY')
    }
    const descriptor = descriptors[key]
    if (
      !descriptor ||
      !Object.hasOwn(descriptor, 'value') ||
      (allowedKeys && !allowedKeys.has(key))
    ) {
      throw new Error('PRIVACY_EXPORT_INVALID_DEPENDENCY')
    }
    result[key] = descriptor.value
  }
  return result
}

function normalizeLimits(value: unknown): PrivacyExportLimits {
  if (value === undefined) return DEFAULT_LIMITS
  const values = snapshotRecord(value, LIMIT_KEYS)
  const limits = { ...DEFAULT_LIMITS }
  for (const key of Object.keys(values) as (keyof PrivacyExportLimits)[]) {
    const count = values[key]
    if (!Number.isSafeInteger(count) || (count as number) < 1) {
      throw new Error('PRIVACY_EXPORT_INVALID_DEPENDENCY')
    }
    limits[key] = count as number
  }
  return Object.freeze(limits)
}

function containsExportControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x1f || codePoint === 0x7f) return true
  }
  return false
}

function isForbiddenExportString(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    /^[A-Z]:[\\/]/i.test(value) ||
    value.includes('://') ||
    containsExportControlCharacter(value) ||
    /^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA)\b/iu.test(value) ||
    /(?:^|[^A-Z0-9])(?:SECRET|PASSWORD|CREDENTIAL|API.?KEY|ACCESS.?TOKEN|AUTH.?TOKEN|REFRESH.?TOKEN|ENDPOINT|NATIVE.?(?:ERROR|STACK)|SQL|PATH)(?:$|[^A-Z0-9])/iu.test(
      value
    )
  )
}

function normalizeJsonValue(value: unknown, key: string, depth = 0): unknown {
  if (depth > 8) throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    if (typeof value === 'string' && isForbiddenExportString(value)) {
      throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
    }
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value) && !isProxy(value)) {
    if (value.length > 10_000) throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const allowed = new Set<PropertyKey>(['length'])
    const result: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const property = String(index)
      allowed.add(property)
      const descriptor = descriptors[property]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
      }
      result.push(normalizeJsonValue(descriptor.value, key, depth + 1))
    }
    if (Reflect.ownKeys(descriptors).some((property) => !allowed.has(property))) {
      throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
    }
    return result
  }
  if (typeof value !== 'object' || value === null || isProxy(value)) {
    throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(descriptors).length > 256) throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
  const result: Record<string, unknown> = Object.create(null)
  for (const property of Reflect.ownKeys(descriptors)) {
    if (
      typeof property !== 'string' ||
      property === '__proto__' ||
      property === 'prototype' ||
      property === 'constructor' ||
      FORBIDDEN_KEY.test(property)
    ) {
      throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
    }
    const descriptor = descriptors[property]
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
    }
    result[property] = normalizeJsonValue(descriptor.value, property, depth + 1)
  }
  return result
}

function normalizeOwnerRecord(
  category: PrivacyDataCategory,
  value: unknown
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || isProxy(value))
    throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
  const prototype = Object.getPrototypeOf(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
  const kindDescriptor = descriptors.kind
  if (
    !kindDescriptor?.enumerable ||
    !Object.hasOwn(kindDescriptor, 'value') ||
    typeof kindDescriptor.value !== 'string'
  ) {
    throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
  }
  const allowed = EXPORT_RECORD_FIELDS[category][kindDescriptor.value]
  if (!allowed) throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
  const result: Record<string, unknown> = Object.create(null)
  for (const property of Reflect.ownKeys(descriptors)) {
    const descriptor = typeof property === 'string' ? descriptors[property] : undefined
    if (
      typeof property !== 'string' ||
      !allowed.has(property) ||
      !descriptor?.enumerable ||
      !Object.hasOwn(descriptor, 'value')
    ) {
      throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
    }
    result[property] = normalizeJsonValue(descriptor.value, property, 1)
  }
  return result
}

function jsonStringByteLength(value: string, stopAfter: number): number {
  let bytes = 2
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (
      codeUnit === 0x22 ||
      codeUnit === 0x5c ||
      codeUnit === 0x08 ||
      codeUnit === 0x09 ||
      codeUnit === 0x0a ||
      codeUnit === 0x0c ||
      codeUnit === 0x0d
    ) {
      bytes += 2
    } else if (codeUnit <= 0x1f) {
      bytes += 6
    } else {
      const codePoint = value.codePointAt(index) ?? 0
      if (codePoint > 0xffff) index += 1
      bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
    }
    if (bytes > stopAfter) return bytes
  }
  return bytes
}

function measureJsonBytes(value: unknown, stopAfter: number, depth = 0): number {
  if (depth > 8) return stopAfter + 1
  if (value === null) return 4
  if (typeof value === 'boolean') return value ? 4 : 5
  if (typeof value === 'number') return Buffer.byteLength(String(value), 'utf8')
  if (typeof value === 'string') return jsonStringByteLength(value, stopAfter)
  if (Array.isArray(value)) {
    let bytes = 2
    for (let index = 0; index < value.length; index += 1) {
      bytes += (index > 0 ? 1 : 0) + measureJsonBytes(value[index], stopAfter - bytes, depth + 1)
      if (bytes > stopAfter) return bytes
    }
    return bytes
  }
  if (typeof value !== 'object' || value === null) return stopAfter + 1
  let bytes = 2
  let index = 0
  for (const [property, child] of Object.entries(value)) {
    bytes += (index > 0 ? 1 : 0) + jsonStringByteLength(property, stopAfter - bytes) + 1
    bytes += measureJsonBytes(child, stopAfter - bytes, depth + 1)
    if (bytes > stopAfter) return bytes
    index += 1
  }
  return bytes
}

async function writeStream(stream: ExportStream, chunk: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      stream.removeListener('error', onError)
      reject(error)
    }
    stream.once('error', onError)
    stream.write(chunk, (error) => {
      stream.removeListener('error', onError)
      if (error) reject(error)
      else resolve()
    })
  })
}

async function finishStream(stream: ExportStream): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      stream.removeListener('error', onError)
      reject(error)
    }
    stream.once('error', onError)
    stream.end(() => {
      stream.removeListener('error', onError)
      resolve()
    })
  })
}

async function destroyStream(stream: ExportStream | null): Promise<void> {
  if (!stream) return
  stream.destroy()
  await Promise.race([
    once(stream as unknown as NodeJS.EventEmitter, 'close').catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 100))
  ])
}

function makeWriter(
  stream: ExportStream,
  limits: PrivacyExportLimits,
  total: { records: number; bytes: number },
  category: { records: number; bytes: number },
  categoryName: PrivacyDataCategory
): PrivacyOwnerExportWriter {
  return Object.freeze({
    write: async (record) => {
      const normalized = normalizeOwnerRecord(categoryName, record)
      const measuredBytes = measureJsonBytes(normalized, limits.maxRecordBytes)
      if (measuredBytes > limits.maxRecordBytes) throw new Error('PRIVACY_EXPORT_LIMIT_EXCEEDED')
      const serialized = JSON.stringify(normalized)
      const recordBytes = Buffer.byteLength(serialized, 'utf8')
      if (recordBytes !== measuredBytes) throw new Error('PRIVACY_EXPORT_RECORD_INVALID')
      const chunkBytes = recordBytes + (category.records > 0 ? 1 : 0)
      if (
        recordBytes > limits.maxRecordBytes ||
        category.records + 1 > limits.maxCategoryRecords ||
        category.bytes + chunkBytes > limits.maxCategoryBytes ||
        total.records + 1 > limits.maxTotalRecords ||
        total.bytes + chunkBytes > limits.maxTotalBytes
      ) {
        throw new Error('PRIVACY_EXPORT_LIMIT_EXCEEDED')
      }
      await writeStream(stream, `${category.records > 0 ? ',' : ''}${serialized}`)
      category.records += 1
      category.bytes += chunkBytes
      total.records += 1
      total.bytes += chunkBytes
      return Object.freeze({ byteCount: recordBytes })
    }
  })
}

function normalizeReportId(value: unknown): string {
  if (typeof value !== 'string' || !REPORT_ID.test(value)) {
    throw new Error('PRIVACY_EXPORT_INVALID_DEPENDENCY')
  }
  return value
}

function validateDialogResult(value: unknown): SaveDialogResult {
  const values = snapshotRecord(value, new Set(['canceled', 'filePath']))
  if (typeof values.canceled !== 'boolean') throw new Error('PRIVACY_EXPORT_DIALOG_FAILED')
  if (values.filePath !== undefined && typeof values.filePath !== 'string') {
    throw new Error('PRIVACY_EXPORT_DIALOG_FAILED')
  }
  return Object.freeze({
    canceled: values.canceled,
    filePath: values.filePath as string | undefined
  })
}

function normalizeCategorySelection(value: unknown): readonly PrivacyDataCategory[] {
  if (
    !Array.isArray(value) ||
    isProxy(value) ||
    value.length < 1 ||
    value.length > PRIVACY_DATA_CATEGORIES.length
  ) {
    throw new Error('PRIVACY_EXPORT_REQUEST_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const allowedKeys = new Set<PropertyKey>(['length'])
  const categories: PrivacyDataCategory[] = []
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index)
    allowedKeys.add(key)
    const descriptor = descriptors[key]
    const category = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined
    if (
      !descriptor?.enumerable ||
      typeof category !== 'string' ||
      !DATA_CATEGORY_SET.has(category) ||
      categories.includes(category as PrivacyDataCategory)
    ) {
      throw new Error('PRIVACY_EXPORT_REQUEST_INVALID')
    }
    categories.push(category as PrivacyDataCategory)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key)))
    throw new Error('PRIVACY_EXPORT_REQUEST_INVALID')
  return Object.freeze(categories)
}

function normalizeExportRequest(value: unknown): {
  readonly categories: readonly PrivacyDataCategory[]
  readonly policy: PrivacyRetentionPolicyV1
  readonly getOwner: PrivacyDataOwnerRegistry['get']
  readonly signal?: AbortSignal
} {
  const request = snapshotRecord(
    value,
    new Set(['categories', 'policy', 'ownerRegistry', 'signal'])
  )
  if (
    !Object.hasOwn(request, 'categories') ||
    !Object.hasOwn(request, 'policy') ||
    !Object.hasOwn(request, 'ownerRegistry')
  ) {
    throw new Error('PRIVACY_EXPORT_REQUEST_INVALID')
  }
  const policyResult = normalizePrivacyResult('policy.update', {
    ok: true,
    data: { policy: request.policy }
  })
  if (!policyResult.ok) throw new Error('PRIVACY_EXPORT_REQUEST_INVALID')
  const registry = snapshotRecord(request.ownerRegistry, new Set(['get', 'list']))
  if (typeof registry.get !== 'function' || isProxy(registry.get))
    throw new Error('PRIVACY_EXPORT_REQUEST_INVALID')
  if (request.signal !== undefined && !(request.signal instanceof AbortSignal))
    throw new Error('PRIVACY_EXPORT_REQUEST_INVALID')
  return Object.freeze({
    categories: normalizeCategorySelection(request.categories),
    policy: policyResult.data.policy,
    getOwner: registry.get.bind(request.ownerRegistry) as PrivacyDataOwnerRegistry['get'],
    ...(request.signal === undefined ? {} : { signal: request.signal as AbortSignal })
  })
}

function sameFileIdentity(
  left: PrivacyExportTargetSnapshot | null,
  right: PrivacyExportTargetSnapshot | null
): boolean {
  return left !== null && right !== null && left.dev === right.dev && left.ino === right.ino
}

function sameTarget(
  left: PrivacyExportTargetSnapshot | null,
  right: PrivacyExportTargetSnapshot | null
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

function sameTargetIdentity(
  left: PrivacyExportTargetSnapshot | null,
  right: PrivacyExportTargetSnapshot | null
): boolean {
  if (left === null || right === null) return left === right
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  )
}

function snapshotRegularFileStat(stat: {
  readonly dev: number | bigint
  readonly ino: number | bigint
  readonly size: number | bigint
  readonly mtimeMs: number
  readonly ctimeMs: number
  isFile: () => boolean
}): PrivacyExportTargetSnapshot {
  const snapshot = {
    dev: Number(stat.dev),
    ino: Number(stat.ino),
    size: Number(stat.size),
    mtimeMs: Number(stat.mtimeMs),
    ctimeMs: Number(stat.ctimeMs)
  }
  if (
    !stat.isFile() ||
    !Number.isSafeInteger(snapshot.size) ||
    snapshot.size < 0 ||
    !Object.values(snapshot).every(Number.isFinite)
  ) {
    throw new Error('PRIVACY_EXPORT_TEMP_INVALID')
  }
  return Object.freeze(snapshot)
}

async function snapshotDirectory(directory: string): Promise<PrivacyExportDirectorySnapshot> {
  const stat = await fs.lstat(directory)
  const snapshot = {
    dev: Number(stat.dev),
    ino: Number(stat.ino)
  }
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    !Object.values(snapshot).every(Number.isFinite)
  ) {
    throw new Error('PRIVACY_EXPORT_DIRECTORY_INVALID')
  }
  return Object.freeze(snapshot)
}

function sameDirectory(
  left: PrivacyExportDirectorySnapshot,
  right: PrivacyExportDirectorySnapshot
): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function abortableExportOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('PRIVACY_EXPORT_CANCELLED'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('PRIVACY_EXPORT_CANCELLED'))
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

export function createPrivacyCategoryExporter(
  options: PrivacyCategoryExporterOptions
): PrivacyCategoryExporter {
  const values = snapshotRecord(options, OPTION_KEYS)
  if (typeof values.showSaveDialog !== 'function' || isProxy(values.showSaveDialog)) {
    throw new Error('PRIVACY_EXPORT_INVALID_DEPENDENCY')
  }
  for (const name of [
    'now',
    'createReportId',
    'createStream',
    'openTempFile',
    'syncFile',
    'renameFile',
    'linkFile',
    'removeFile',
    'realpathDirectory',
    'lstatTarget',
    'syncDirectory'
  ]) {
    const candidate = values[name]
    if (candidate !== undefined && (typeof candidate !== 'function' || isProxy(candidate))) {
      throw new Error('PRIVACY_EXPORT_INVALID_DEPENDENCY')
    }
  }

  const showSaveDialog = (
    values.showSaveDialog as PrivacyCategoryExporterOptions['showSaveDialog']
  ).bind(options)
  const now = values.now
    ? (values.now as NonNullable<PrivacyCategoryExporterOptions['now']>).bind(options)
    : Date.now
  const createReportId = values.createReportId
    ? (values.createReportId as NonNullable<PrivacyCategoryExporterOptions['createReportId']>).bind(
        options
      )
    : () => `report_${randomUUID().replaceAll('-', '')}`
  const createStream = values.createStream
    ? (values.createStream as NonNullable<PrivacyCategoryExporterOptions['createStream']>).bind(
        options
      )
    : (filePath: string) => createWriteStream(filePath, { flags: 'wx', mode: 0o600 })
  const syncFile = values.syncFile
    ? (values.syncFile as NonNullable<PrivacyCategoryExporterOptions['syncFile']>).bind(options)
    : async (filePath: string) => {
        const handle = await fs.open(filePath, 'r')
        try {
          await handle.sync()
        } finally {
          await handle.close()
        }
      }
  const renameFile = values.renameFile
    ? (values.renameFile as NonNullable<PrivacyCategoryExporterOptions['renameFile']>).bind(options)
    : fs.rename.bind(fs)
  const linkFile = values.linkFile
    ? (values.linkFile as NonNullable<PrivacyCategoryExporterOptions['linkFile']>).bind(options)
    : fs.link.bind(fs)
  const removeFile = values.removeFile
    ? (values.removeFile as NonNullable<PrivacyCategoryExporterOptions['removeFile']>).bind(options)
    : async (filePath: string) => fs.rm(filePath, { force: true })
  const realpathDirectory = values.realpathDirectory
    ? (
        values.realpathDirectory as NonNullable<PrivacyCategoryExporterOptions['realpathDirectory']>
      ).bind(options)
    : fs.realpath.bind(fs)
  const lstatTarget = values.lstatTarget
    ? (values.lstatTarget as NonNullable<PrivacyCategoryExporterOptions['lstatTarget']>).bind(
        options
      )
    : async (filePath: string): Promise<PrivacyExportTargetSnapshot | null> => {
        try {
          const stat = await fs.lstat(filePath)
          if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error('PRIVACY_EXPORT_TARGET_INVALID')
          return snapshotRegularFileStat(stat)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
          throw error
        }
      }
  const useLegacyTempAdapter = values.createStream !== undefined || values.syncFile !== undefined
  const openTempFile = values.openTempFile
    ? (values.openTempFile as NonNullable<PrivacyCategoryExporterOptions['openTempFile']>).bind(
        options
      )
    : useLegacyTempAdapter
      ? async (
          filePath: string,
          streamOptions: { readonly flags: 'wx'; readonly mode: number }
        ) => {
          const stream = createStream(filePath, streamOptions)
          return Object.freeze({
            stream,
            sync: () => syncFile(filePath),
            stat: async () => {
              const stat = await lstatTarget(filePath)
              if (!stat) throw new Error('PRIVACY_EXPORT_TEMP_INVALID')
              return stat
            },
            close: async () => undefined
          })
        }
      : async (
          filePath: string,
          streamOptions: { readonly flags: 'wx'; readonly mode: number }
        ) => {
          const handle = await fs.open(filePath, streamOptions.flags, streamOptions.mode)
          let closed = false
          try {
            snapshotRegularFileStat(await handle.stat())
            const stream = createWriteStream(filePath, { fd: handle.fd, autoClose: false })
            return Object.freeze({
              stream,
              sync: () => handle.sync(),
              stat: async () => snapshotRegularFileStat(await handle.stat()),
              close: async () => {
                if (closed) return
                closed = true
                await handle.close()
              }
            })
          } catch (error) {
            await handle.close().catch(() => undefined)
            throw error
          }
        }
  const syncDirectory = values.syncDirectory
    ? (values.syncDirectory as NonNullable<PrivacyCategoryExporterOptions['syncDirectory']>).bind(
        options
      )
    : async (directory: string) => {
        if (process.platform === 'win32') return
        const handle = await fs.open(directory, 'r')
        try {
          await handle.sync()
        } finally {
          await handle.close()
        }
      }
  const limits = normalizeLimits(values.limits)

  return Object.freeze({
    exportCategories: async (rawRequest, providedSignal) => {
      const request = normalizeExportRequest(rawRequest)
      const signal = providedSignal ?? request.signal ?? new AbortController().signal
      const reportId = normalizeReportId(createReportId())
      const dialog = validateDialogResult(await abortableExportOperation(showSaveDialog(), signal))
      if (dialog.canceled) {
        return Object.freeze({
          format: EXPORT_FORMAT,
          categories: Object.freeze([...request.categories]),
          cancelled: true,
          itemCount: 0,
          byteCount: 0,
          reportId
        })
      }
      if (!dialog.filePath || dialog.filePath.length > 4096) {
        throw new Error('PRIVACY_EXPORT_DIALOG_FAILED')
      }
      if (signal.aborted) throw new Error('PRIVACY_EXPORT_CANCELLED')

      const basename = path.basename(dialog.filePath)
      if (basename === '.' || basename === '..' || basename.length === 0)
        throw new Error('PRIVACY_EXPORT_DIALOG_FAILED')
      const selectedDirectory = path.dirname(dialog.filePath)
      const approvedDirectory = await realpathDirectory(selectedDirectory)
      const approvedDirectorySnapshot = await snapshotDirectory(approvedDirectory)
      const approvedTarget = path.join(approvedDirectory, basename)
      const initialTarget = await lstatTarget(approvedTarget)
      const tempFile = path.join(
        approvedDirectory,
        `.${path.basename(approvedTarget)}.${randomUUID()}.tmp`
      )
      const recoveryFile = path.join(
        approvedDirectory,
        `.${path.basename(approvedTarget)}.${randomUUID()}.recovery`
      )
      let stream: ExportStream | null = null
      let openedTemp: ExportTempFile | null = null
      let tempSnapshot: PrivacyExportTargetSnapshot | null = null
      let recoverySnapshot: PrivacyExportTargetSnapshot | null = null
      let finalized = false
      let targetLinked = false
      let targetArchived = false
      const abortStream = () => stream?.destroy()
      signal.addEventListener('abort', abortStream, { once: true })
      try {
        openedTemp = await openTempFile(tempFile, Object.freeze({ flags: 'wx', mode: 0o600 }))
        stream = openedTemp.stream
        const createdAt = now()
        if (!Number.isSafeInteger(createdAt) || (createdAt as number) < 0) {
          throw new Error('PRIVACY_EXPORT_INVALID_DEPENDENCY')
        }
        const header = `{"format":${JSON.stringify(EXPORT_FORMAT)},"createdAt":${JSON.stringify(
          new Date(createdAt as number).toISOString()
        )},"policyVersion":${request.policy.version},"categories":[`
        const total = { records: 0, bytes: Buffer.byteLength(header, 'utf8') }
        if (total.bytes > limits.maxTotalBytes) throw new Error('PRIVACY_EXPORT_LIMIT_EXCEEDED')
        await writeStream(stream, header)

        for (const [index, categoryName] of request.categories.entries()) {
          if (signal.aborted) throw new Error('PRIVACY_EXPORT_CANCELLED')
          const owner = request.getOwner(categoryName)
          if (!owner) throw new Error('PRIVACY_EXPORT_OWNER_MISSING')
          const categoryHeader = `${index > 0 ? ',' : ''}{"category":${JSON.stringify(
            categoryName
          )},"records":[`
          const categoryState = { records: 0, bytes: 0 }
          const categoryHeaderBytes = Buffer.byteLength(categoryHeader, 'utf8')
          if (total.bytes + categoryHeaderBytes > limits.maxTotalBytes) {
            throw new Error('PRIVACY_EXPORT_LIMIT_EXCEEDED')
          }
          await writeStream(stream, categoryHeader)
          total.bytes += categoryHeaderBytes
          const ownerResult = await owner.export(
            Object.freeze({ category: categoryName, nowMs: createdAt as number }),
            makeWriter(stream, limits, total, categoryState, categoryName),
            signal
          )
          const result = normalizePrivacyOwnerExportResult(ownerResult, categoryName)
          if (
            !result.ok ||
            result.cancelled ||
            result.partial ||
            result.category !== categoryName ||
            result.exportedItemCount !== categoryState.records ||
            result.exportedByteCount !==
              categoryState.bytes - Math.max(0, categoryState.records - 1)
          ) {
            throw new Error(
              result.code === 'PRIVACY_OWNER_LIMIT_REACHED'
                ? 'PRIVACY_EXPORT_LIMIT_EXCEEDED'
                : 'PRIVACY_EXPORT_OWNER_FAILED'
            )
          }
          const categoryFooter = `],"itemCount":${categoryState.records}}`
          const footerBytes = Buffer.byteLength(categoryFooter, 'utf8')
          if (total.bytes + footerBytes > limits.maxTotalBytes) {
            throw new Error('PRIVACY_EXPORT_LIMIT_EXCEEDED')
          }
          await writeStream(stream, categoryFooter)
          total.bytes += footerBytes
        }

        const footer = `],"itemCount":${total.records}}`
        const footerBytes = Buffer.byteLength(footer, 'utf8')
        if (total.bytes + footerBytes > limits.maxTotalBytes) {
          throw new Error('PRIVACY_EXPORT_LIMIT_EXCEEDED')
        }
        await writeStream(stream, footer)
        total.bytes += footerBytes
        await finishStream(stream)
        stream = null
        await openedTemp.sync()
        const stat = await openedTemp.stat()
        tempSnapshot = stat
        await openedTemp.close()
        openedTemp = null
        if (signal.aborted) throw new Error('PRIVACY_EXPORT_CANCELLED')
        const namedTemp = await lstatTarget(tempFile)
        if (!sameTarget(stat, namedTemp)) throw new Error('PRIVACY_EXPORT_TEMP_CHANGED')
        const currentDirectory = await realpathDirectory(selectedDirectory)
        if (
          currentDirectory !== approvedDirectory ||
          !sameDirectory(approvedDirectorySnapshot, await snapshotDirectory(approvedDirectory))
        ) {
          throw new Error('PRIVACY_EXPORT_DIRECTORY_CHANGED')
        }
        const currentTarget = await lstatTarget(approvedTarget)
        if (!sameTarget(initialTarget, currentTarget))
          throw new Error('PRIVACY_EXPORT_TARGET_CHANGED')
        if (signal.aborted) throw new Error('PRIVACY_EXPORT_CANCELLED')
        if (initialTarget !== null) {
          await renameFile(approvedTarget, recoveryFile)
          targetArchived = true
          const archivedTarget = await lstatTarget(recoveryFile)
          if (!sameTargetIdentity(initialTarget, archivedTarget)) {
            throw new Error('PRIVACY_EXPORT_TARGET_CHANGED')
          }
          recoverySnapshot = archivedTarget
          if ((await lstatTarget(approvedTarget)) !== null) {
            throw new Error('PRIVACY_EXPORT_TARGET_CHANGED')
          }
        }
        await linkFile(tempFile, approvedTarget)
        targetLinked = true
        const linkedTemp = await lstatTarget(tempFile)
        const linkedTarget = await lstatTarget(approvedTarget)
        if (sameTargetIdentity(stat, linkedTarget)) tempSnapshot = linkedTarget
        if (!sameFileIdentity(linkedTemp, linkedTarget)) {
          throw new Error('PRIVACY_EXPORT_TARGET_CHANGED')
        }
        tempSnapshot = linkedTarget
        await removeFile(tempFile)
        const committedTarget = await lstatTarget(approvedTarget)
        if (!sameTargetIdentity(linkedTarget, committedTarget)) {
          throw new Error('PRIVACY_EXPORT_TARGET_CHANGED')
        }
        tempSnapshot = committedTarget
        await syncDirectory(approvedDirectory)
        if (targetArchived) {
          const durableTarget = await lstatTarget(approvedTarget)
          if (!sameTargetIdentity(committedTarget, durableTarget)) {
            throw new Error('PRIVACY_EXPORT_TARGET_CHANGED')
          }
          await removeFile(recoveryFile)
          targetArchived = false
          finalized = true
          await syncDirectory(approvedDirectory)
        } else {
          finalized = true
        }
        return Object.freeze({
          format: EXPORT_FORMAT,
          categories: Object.freeze([...request.categories]),
          cancelled: false,
          itemCount: total.records,
          byteCount: stat.size,
          reportId
        })
      } catch (error) {
        await destroyStream(stream)
        await openedTemp?.close().catch(() => undefined)
        let cleanupError: unknown
        if (targetLinked && !finalized && tempSnapshot) {
          try {
            const currentTarget = await lstatTarget(approvedTarget)
            if (sameFileIdentity(tempSnapshot, currentTarget)) await removeFile(approvedTarget)
          } catch (failure) {
            cleanupError = failure
          }
        }
        if (targetArchived && recoverySnapshot) {
          try {
            const archivedTarget = await lstatTarget(recoveryFile)
            if (!sameFileIdentity(recoverySnapshot, archivedTarget)) {
              throw new Error('PRIVACY_EXPORT_TARGET_RECOVERY_FAILED')
            }
            if ((await lstatTarget(approvedTarget)) !== null) {
              throw new Error('PRIVACY_EXPORT_TARGET_RECOVERY_REQUIRED')
            }
            await linkFile(recoveryFile, approvedTarget)
            const restoredTarget = await lstatTarget(approvedTarget)
            if (!sameFileIdentity(archivedTarget, restoredTarget)) {
              throw new Error('PRIVACY_EXPORT_TARGET_RECOVERY_FAILED')
            }
            await removeFile(recoveryFile)
            targetArchived = false
          } catch (failure) {
            cleanupError ??= failure
          }
        }
        if (!finalized) {
          try {
            await removeFile(tempFile)
          } catch (failure) {
            cleanupError ??= failure
          }
          try {
            await syncDirectory(approvedDirectory)
          } catch (failure) {
            cleanupError ??= failure
          }
        }
        if (cleanupError !== undefined) {
          throw new AggregateError([error, cleanupError], 'PRIVACY_EXPORT_TEMP_CLEANUP_FAILED')
        }
        throw error
      } finally {
        signal.removeEventListener('abort', abortStream)
      }
    }
  })
}
