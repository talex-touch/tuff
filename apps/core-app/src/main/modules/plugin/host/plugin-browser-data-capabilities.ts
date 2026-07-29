import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import type { PluginSqliteQueryResult } from '../runtime/plugin-sqlite-worker-protocol'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { Buffer } from 'node:buffer'
import { constants as fsConstants } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, readdir, realpath, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { types as utilTypes } from 'node:util'
import { PluginSqliteWorkerClient } from '../runtime/plugin-sqlite-worker-client'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'

export const PLUGIN_BROWSER_DATA_TIMEOUT_MS = 30_000
export const PLUGIN_BROWSER_DATA_MAX_PROFILES = 8
export const PLUGIN_BROWSER_DATA_MAX_RECORDS = 100
export const PLUGIN_BROWSER_DATA_MAX_ROWS_PER_PROFILE = 50
export const PLUGIN_BROWSER_DATA_MAX_BOOKMARK_BYTES = 4 * 1024 * 1024
export const PLUGIN_BROWSER_DATA_MAX_DATABASE_BYTES = 64 * 1024 * 1024
export const PLUGIN_BROWSER_DATA_MAX_SIDECAR_BYTES = 16 * 1024 * 1024
export const PLUGIN_BROWSER_DATA_MAX_RESULT_BYTES = 768 * 1024

export type PluginBrowserDataBrowserId = 'chrome' | 'edge' | 'brave' | 'arc'
export type PluginBrowserDataSourceId = 'bookmarks' | 'history'
export type PluginBrowserDataFixedQueryId = 'chromium-history'

export interface PluginBrowserDataRecord {
  readonly source: PluginBrowserDataSourceId
  readonly browser: PluginBrowserDataBrowserId
  readonly browserName: string
  readonly profile: string
  readonly title: string
  readonly url: string
  readonly folder?: string
  readonly visitedAt?: number
}

export type PluginBrowserDataDiagnosticCode =
  | 'BROWSER_DATA_OK'
  | 'BROWSER_DATA_NOT_FOUND'
  | 'BROWSER_DATA_PLATFORM_UNSUPPORTED'
  | 'BROWSER_DATA_SCHEMA_UNSUPPORTED'
  | 'BROWSER_DATA_SOURCE_INVALID'
  | 'BROWSER_DATA_SOURCE_TOO_LARGE'
  | 'BROWSER_DATA_PARSE_FAILED'
  | 'BROWSER_DATA_QUERY_FAILED'
  | 'BROWSER_DATA_RESULT_LIMIT'
  | 'BROWSER_DATA_TEMP_CLEANUP_FAILED'

export interface PluginBrowserDataDiagnostic {
  readonly source: PluginBrowserDataSourceId
  readonly browser: PluginBrowserDataBrowserId
  readonly status: 'available' | 'partial' | 'not-found' | 'unsupported' | 'failed'
  readonly code: PluginBrowserDataDiagnosticCode
  readonly profileCount: number
  readonly recordCount: number
}

export type PluginBrowserDataScanResult =
  | {
      readonly operation: 'scan'
      readonly status: 'completed'
      readonly records: readonly PluginBrowserDataRecord[]
      readonly diagnostics: readonly PluginBrowserDataDiagnostic[]
    }
  | {
      readonly operation: 'scan'
      readonly status: 'blocked'
      readonly code: 'BROWSER_DATA_SOURCE_DISABLED' | 'BROWSER_DATA_PLATFORM_UNSUPPORTED'
      readonly records: readonly []
      readonly diagnostics: readonly []
    }

export interface PluginBrowserDataQuery {
  (
    databasePath: string,
    queryId: PluginBrowserDataFixedQueryId,
    signal: AbortSignal
  ): Promise<PluginSqliteQueryResult>
}

export interface FixedPluginBrowserDataServiceOptions {
  readonly platform: NodeJS.Platform
  readonly homeDirectory: string
  readonly appDataDirectory: string
  readonly tempDirectory: string
  readonly query: PluginBrowserDataQuery
}

export interface PluginBrowserDataCapabilitiesOptions {
  readonly activation: PluginActivationIdentity
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  resolveEnabledSources(pluginName: string): readonly PluginBrowserDataSourceId[]
  authorizeRead(pluginName: string): boolean
  authorizeIndex(pluginName: string): boolean
  watchReadPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  watchIndexPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly service: TrustedPluginBrowserDataService
}

export interface PluginBrowserDataCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close(): Promise<void>
}

type BrowserDataScanRequest = {
  readonly operation: 'scan'
  readonly sources: readonly PluginBrowserDataSourceId[]
  readonly browser?: PluginBrowserDataBrowserId
}

type BrowserFamily = 'chromium'

interface BrowserDefinition {
  readonly id: PluginBrowserDataBrowserId
  readonly name: string
  readonly family: BrowserFamily
  readonly root: string
}

interface ProfileFile {
  readonly definition: BrowserDefinition
  readonly profile: string
  readonly source: PluginBrowserDataSourceId
  readonly schema: PluginBrowserDataFixedQueryId | 'chromium-bookmarks'
  readonly filePath: string
}

interface TrustedPluginBrowserDataService {
  readonly platform: NodeJS.Platform
  scan(
    request: BrowserDataScanRequest,
    signal: AbortSignal,
    checkpoint: () => void
  ): Promise<PluginBrowserDataScanResult>
}

const BROWSER_IDS = Object.freeze(['chrome', 'edge', 'brave', 'arc'] as const)
const SOURCE_IDS = Object.freeze(['bookmarks', 'history'] as const)
const BROWSER_ID_SET = new Set<string>(BROWSER_IDS)
const SOURCE_ID_SET = new Set<string>(SOURCE_IDS)
const STABLE_DIAGNOSTIC_CODES = new Set<string>([
  'BROWSER_DATA_OK',
  'BROWSER_DATA_NOT_FOUND',
  'BROWSER_DATA_PLATFORM_UNSUPPORTED',
  'BROWSER_DATA_SCHEMA_UNSUPPORTED',
  'BROWSER_DATA_SOURCE_INVALID',
  'BROWSER_DATA_SOURCE_TOO_LARGE',
  'BROWSER_DATA_PARSE_FAILED',
  'BROWSER_DATA_QUERY_FAILED',
  'BROWSER_DATA_RESULT_LIMIT',
  'BROWSER_DATA_TEMP_CLEANUP_FAILED'
])
const TRUSTED_QUERIES = new WeakSet<object>()
const TRUSTED_SERVICES = new WeakSet<object>()
const CHROMIUM_EPOCH_MICROS = 11_644_473_600_000_000
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000
const EMPTY_RESULT_LIST = Object.freeze([]) as readonly []

const FIXED_QUERIES: Readonly<Record<PluginBrowserDataFixedQueryId, string>> = Object.freeze({
  'chromium-history': `
    SELECT url, title, last_visit_time AS rawVisit
    FROM urls
    WHERE last_visit_time > 0
    ORDER BY last_visit_time DESC
    LIMIT ${PLUGIN_BROWSER_DATA_MAX_ROWS_PER_PROFILE + 1}
  `
})

function invalid(): never {
  throw new TypeError('PLUGIN_BROWSER_DATA_INVALID')
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = allowedKeys
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

function dataMethod<T extends (...args: never[]) => unknown>(value: object, key: string): T {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'function') invalid()
  if (utilTypes.isProxy(descriptor.value)) invalid()
  return descriptor.value as T
}

function snapshotActivation(value: unknown): PluginActivationIdentity {
  const record = exactRecord(value, ['name', 'pluginInstanceId', 'activationGeneration', 'key'])
  if (
    typeof record.name !== 'string' ||
    typeof record.pluginInstanceId !== 'string' ||
    !Number.isSafeInteger(record.activationGeneration) ||
    Number(record.activationGeneration) < 1 ||
    typeof record.key !== 'string'
  ) {
    invalid()
  }
  return Object.freeze({
    name: record.name,
    pluginInstanceId: record.pluginInstanceId,
    activationGeneration: Number(record.activationGeneration),
    key: record.key
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

function snapshotDenseArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || value.length > maximum) invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length !== value.length + 1) invalid()
  const output: unknown[] = []
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    output.push(descriptor.value)
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (
    !lengthDescriptor ||
    !('value' in lengthDescriptor) ||
    lengthDescriptor.value !== value.length
  ) {
    invalid()
  }
  return output
}

function validateRequest(value: unknown): BrowserDataScanRequest {
  const record = exactRecord(value, ['operation', 'sources', 'browser'], ['operation', 'sources'])
  if (record.operation !== 'scan') invalid()
  const rawSources = snapshotDenseArray(record.sources, SOURCE_IDS.length)
  if (rawSources.length === 0) invalid()
  const sources: PluginBrowserDataSourceId[] = []
  for (const source of rawSources) {
    if (
      typeof source !== 'string' ||
      !SOURCE_ID_SET.has(source) ||
      sources.includes(source as never)
    ) {
      invalid()
    }
    sources.push(source as PluginBrowserDataSourceId)
  }
  const browser = record.browser
  if (browser !== undefined && (typeof browser !== 'string' || !BROWSER_ID_SET.has(browser))) {
    invalid()
  }
  return Object.freeze({
    operation: 'scan',
    sources: Object.freeze(sources),
    ...(browser ? { browser: browser as PluginBrowserDataBrowserId } : {})
  })
}

function boundedText(value: unknown, maximumBytes: number, allowEmpty = false): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maximumBytes) invalid()
  const normalized = value.trim()
  if (!allowEmpty && normalized.length === 0) invalid()
  return normalized
}

function validateUrl(value: unknown): string {
  const input = boundedText(value, 2_048)
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    invalid()
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.hostname.length === 0
  ) {
    invalid()
  }
  return parsed.toString()
}

function validateRecord(value: unknown): PluginBrowserDataRecord {
  const record = exactRecord(
    value,
    ['source', 'browser', 'browserName', 'profile', 'title', 'url', 'folder', 'visitedAt'],
    ['source', 'browser', 'browserName', 'profile', 'title', 'url']
  )
  if (
    typeof record.source !== 'string' ||
    !SOURCE_ID_SET.has(record.source) ||
    typeof record.browser !== 'string' ||
    !BROWSER_ID_SET.has(record.browser)
  ) {
    invalid()
  }
  const base = {
    source: record.source as PluginBrowserDataSourceId,
    browser: record.browser as PluginBrowserDataBrowserId,
    browserName: boundedText(record.browserName, 64),
    profile: boundedText(record.profile, 128),
    title: boundedText(record.title, 512),
    url: validateUrl(record.url)
  }
  const output: PluginBrowserDataRecord = Object.freeze({
    ...base,
    ...(Object.hasOwn(record, 'folder') ? { folder: boundedText(record.folder, 512, true) } : {}),
    ...(Object.hasOwn(record, 'visitedAt')
      ? (() => {
          if (!Number.isSafeInteger(record.visitedAt) || Number(record.visitedAt) < 0) invalid()
          return { visitedAt: Number(record.visitedAt) }
        })()
      : {})
  })
  if (output.source === 'bookmarks' && output.visitedAt !== undefined) invalid()
  if (output.source === 'history' && output.folder !== undefined) invalid()
  return Object.freeze(output)
}

function validateDiagnostic(value: unknown): PluginBrowserDataDiagnostic {
  const record = exactRecord(value, [
    'source',
    'browser',
    'status',
    'code',
    'profileCount',
    'recordCount'
  ])
  if (
    typeof record.source !== 'string' ||
    !SOURCE_ID_SET.has(record.source) ||
    typeof record.browser !== 'string' ||
    !BROWSER_ID_SET.has(record.browser) ||
    typeof record.status !== 'string' ||
    !['available', 'partial', 'not-found', 'unsupported', 'failed'].includes(record.status) ||
    typeof record.code !== 'string' ||
    !STABLE_DIAGNOSTIC_CODES.has(record.code) ||
    !Number.isSafeInteger(record.profileCount) ||
    Number(record.profileCount) < 0 ||
    Number(record.profileCount) > PLUGIN_BROWSER_DATA_MAX_PROFILES ||
    !Number.isSafeInteger(record.recordCount) ||
    Number(record.recordCount) < 0 ||
    Number(record.recordCount) > PLUGIN_BROWSER_DATA_MAX_RECORDS
  ) {
    invalid()
  }
  return Object.freeze({
    source: record.source as PluginBrowserDataSourceId,
    browser: record.browser as PluginBrowserDataBrowserId,
    status: record.status as PluginBrowserDataDiagnostic['status'],
    code: record.code as PluginBrowserDataDiagnosticCode,
    profileCount: Number(record.profileCount),
    recordCount: Number(record.recordCount)
  })
}

function validateResult(value: unknown): PluginBrowserDataScanResult {
  const record = exactRecord(
    value,
    ['operation', 'status', 'code', 'records', 'diagnostics'],
    ['operation', 'status', 'records', 'diagnostics']
  )
  if (record.operation !== 'scan') invalid()
  const records = snapshotDenseArray(record.records, PLUGIN_BROWSER_DATA_MAX_RECORDS).map(
    validateRecord
  )
  const diagnostics = snapshotDenseArray(
    record.diagnostics,
    BROWSER_IDS.length * SOURCE_IDS.length
  ).map(validateDiagnostic)
  let output: PluginBrowserDataScanResult
  if (record.status === 'completed' && !Object.hasOwn(record, 'code')) {
    output = Object.freeze({
      operation: 'scan',
      status: 'completed',
      records: Object.freeze(records),
      diagnostics: Object.freeze(diagnostics)
    })
  } else if (
    record.status === 'blocked' &&
    (record.code === 'BROWSER_DATA_SOURCE_DISABLED' ||
      record.code === 'BROWSER_DATA_PLATFORM_UNSUPPORTED') &&
    records.length === 0 &&
    diagnostics.length === 0
  ) {
    output = Object.freeze({
      operation: 'scan',
      status: 'blocked',
      code: record.code,
      records: EMPTY_RESULT_LIST,
      diagnostics: EMPTY_RESULT_LIST
    })
  } else {
    invalid()
  }
  if (Buffer.byteLength(JSON.stringify(output), 'utf8') > PLUGIN_BROWSER_DATA_MAX_RESULT_BYTES) {
    invalid()
  }
  return output
}

function assertSignal(signal: AbortSignal): void {
  if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
}

function isPathInside(parentPath: string, targetPath: string, pathApi: typeof path.posix): boolean {
  const relative = pathApi.relative(parentPath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !pathApi.isAbsolute(relative))
}

function definitionsFor(
  platform: NodeJS.Platform,
  homeDirectory: string,
  appDataDirectory: string
): readonly BrowserDefinition[] {
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  if (platform === 'darwin') {
    const support = pathApi.join(homeDirectory, 'Library', 'Application Support')
    return Object.freeze([
      Object.freeze({
        id: 'chrome',
        name: 'Chrome',
        family: 'chromium',
        root: pathApi.join(support, 'Google', 'Chrome')
      }),
      Object.freeze({
        id: 'edge',
        name: 'Edge',
        family: 'chromium',
        root: pathApi.join(support, 'Microsoft Edge')
      }),
      Object.freeze({
        id: 'brave',
        name: 'Brave',
        family: 'chromium',
        root: pathApi.join(support, 'BraveSoftware', 'Brave-Browser')
      }),
      Object.freeze({
        id: 'arc',
        name: 'Arc',
        family: 'chromium',
        root: pathApi.join(support, 'Arc', 'User Data')
      })
    ])
  }
  if (platform === 'win32') {
    const local = appDataDirectory
    return Object.freeze([
      Object.freeze({
        id: 'chrome',
        name: 'Chrome',
        family: 'chromium',
        root: pathApi.join(local, 'Google', 'Chrome', 'User Data')
      }),
      Object.freeze({
        id: 'edge',
        name: 'Edge',
        family: 'chromium',
        root: pathApi.join(local, 'Microsoft', 'Edge', 'User Data')
      }),
      Object.freeze({
        id: 'brave',
        name: 'Brave',
        family: 'chromium',
        root: pathApi.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')
      }),
      Object.freeze({
        id: 'arc',
        name: 'Arc',
        family: 'chromium',
        root: pathApi.join(
          local,
          'Packages',
          'TheBrowserCompany.Arc_ttt1ap7aakyb4',
          'LocalCache',
          'Local',
          'Arc',
          'User Data'
        )
      })
    ])
  }
  if (platform === 'linux') {
    const config = appDataDirectory
    return Object.freeze([
      Object.freeze({
        id: 'chrome',
        name: 'Chrome',
        family: 'chromium',
        root: pathApi.join(config, 'google-chrome')
      }),
      Object.freeze({
        id: 'edge',
        name: 'Edge',
        family: 'chromium',
        root: pathApi.join(config, 'microsoft-edge')
      }),
      Object.freeze({
        id: 'brave',
        name: 'Brave',
        family: 'chromium',
        root: pathApi.join(config, 'BraveSoftware', 'Brave-Browser')
      })
    ])
  }
  return Object.freeze([])
}

async function canonicalDirectory(
  candidate: string,
  trustedParents: readonly string[],
  pathApi: typeof path.posix,
  signal: AbortSignal
): Promise<string | null> {
  assertSignal(signal)
  try {
    const before = await lstat(candidate)
    if (before.isSymbolicLink() || !before.isDirectory()) return null
    const canonical = pathApi.normalize(await realpath(candidate))
    if (canonical !== pathApi.normalize(candidate)) return null
    if (!trustedParents.some((parent) => isPathInside(parent, canonical, pathApi))) return null
    const after = await stat(canonical)
    if (before.dev !== after.dev || before.ino !== after.ino) return null
    assertSignal(signal)
    return canonical
  } catch {
    return null
  }
}

async function boundedDirectoryEntries(directory: string, signal: AbortSignal) {
  assertSignal(signal)
  const entries = await readdir(directory, { withFileTypes: true })
  assertSignal(signal)
  entries.sort((left, right) => left.name.localeCompare(right.name))
  return entries.slice(0, 128)
}

function chromiumProfileName(name: string): boolean {
  return name === 'Default' || name === 'Guest Profile' || /^Profile [0-9]{1,3}$/.test(name)
}

async function discoverProfileFiles(
  definition: BrowserDefinition,
  source: PluginBrowserDataSourceId,
  trustedParents: readonly string[],
  pathApi: typeof path.posix,
  signal: AbortSignal,
  checkpoint: () => void
): Promise<readonly ProfileFile[]> {
  checkpoint()
  const root = await canonicalDirectory(definition.root, trustedParents, pathApi, signal)
  checkpoint()
  if (!root) return Object.freeze([])
  const entries = await boundedDirectoryEntries(root, signal)
  const output: ProfileFile[] = []
  const directFileName = source === 'bookmarks' ? 'Bookmarks' : 'History'
  const directFilePath = pathApi.join(root, directFileName)
  const directStatus = await lstat(directFilePath).catch(() => null)
  if (directStatus?.isFile() && !directStatus.isSymbolicLink()) {
    output.push(
      Object.freeze({
        definition,
        profile: 'Default',
        source,
        schema: source === 'bookmarks' ? 'chromium-bookmarks' : 'chromium-history',
        filePath: directFilePath
      })
    )
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    if (!chromiumProfileName(entry.name)) continue
    const profileRoot = pathApi.join(root, entry.name)
    const canonicalProfile = await canonicalDirectory(profileRoot, [root], pathApi, signal)
    if (!canonicalProfile) continue
    const fileName = source === 'bookmarks' ? 'Bookmarks' : 'History'
    const schema = source === 'bookmarks' ? 'chromium-bookmarks' : 'chromium-history'
    const filePath = pathApi.join(canonicalProfile, fileName)
    const sourceStatus = await lstat(filePath).catch(() => null)
    if (!sourceStatus || sourceStatus.isSymbolicLink() || !sourceStatus.isFile()) continue
    output.push(
      Object.freeze({
        definition,
        profile: entry.name,
        source,
        schema,
        filePath
      })
    )
    if (output.length >= PLUGIN_BROWSER_DATA_MAX_PROFILES) break
  }
  return Object.freeze(output)
}

async function readBoundedRegularFile(
  filePath: string,
  maximumBytes: number,
  signal: AbortSignal,
  checkpoint: () => void
): Promise<Buffer> {
  checkpoint()
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
  const handle = await open(filePath, flags)
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size > maximumBytes) {
      throw Object.assign(new Error('BROWSER_DATA_SOURCE_TOO_LARGE'), {
        code: 'BROWSER_DATA_SOURCE_TOO_LARGE'
      })
    }
    const output = Buffer.alloc(before.size)
    let offset = 0
    while (offset < output.length) {
      assertSignal(signal)
      const { bytesRead } = await handle.read(
        output,
        offset,
        Math.min(64 * 1024, output.length - offset),
        offset
      )
      if (bytesRead <= 0) break
      offset += bytesRead
    }
    if (offset !== output.length) throw new Error('BROWSER_DATA_SOURCE_INVALID')
    const after = await handle.stat()
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) {
      throw new Error('BROWSER_DATA_SOURCE_INVALID')
    }
    checkpoint()
    return output
  } finally {
    await handle.close()
  }
}

async function copyBoundedRegularFile(
  sourcePath: string,
  targetPath: string,
  maximumBytes: number,
  signal: AbortSignal,
  checkpoint: () => void
): Promise<void> {
  const source = await open(sourcePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  let target: Awaited<ReturnType<typeof open>> | null = null
  try {
    const before = await source.stat()
    if (!before.isFile() || before.size > maximumBytes) {
      throw Object.assign(new Error('BROWSER_DATA_SOURCE_TOO_LARGE'), {
        code: 'BROWSER_DATA_SOURCE_TOO_LARGE'
      })
    }
    target = await open(
      targetPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
      0o600
    )
    const chunk = Buffer.alloc(Math.min(64 * 1024, Math.max(1, before.size)))
    let offset = 0
    while (offset < before.size) {
      assertSignal(signal)
      const { bytesRead } = await source.read(
        chunk,
        0,
        Math.min(chunk.length, before.size - offset),
        offset
      )
      if (bytesRead <= 0) break
      let written = 0
      while (written < bytesRead) {
        const result = await target.write(chunk, written, bytesRead - written, offset + written)
        written += result.bytesWritten
      }
      offset += bytesRead
    }
    if (offset !== before.size) throw new Error('BROWSER_DATA_SOURCE_INVALID')
    const after = await source.stat()
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) {
      throw new Error('BROWSER_DATA_SOURCE_INVALID')
    }
    await target.sync()
    checkpoint()
  } finally {
    await target?.close().catch(() => undefined)
    await source.close().catch(() => undefined)
  }
}

async function createTemporaryDatabaseCopy(
  sourcePath: string,
  tempDirectory: string,
  signal: AbortSignal,
  checkpoint: () => void
): Promise<{ readonly directory: string; readonly databasePath: string }> {
  const canonicalTemp = await realpath(tempDirectory)
  const directory = await mkdtemp(path.join(canonicalTemp, 'tuff-browser-data-'))
  const databasePath = path.join(directory, 'browser.sqlite')
  try {
    await copyBoundedRegularFile(
      sourcePath,
      databasePath,
      PLUGIN_BROWSER_DATA_MAX_DATABASE_BYTES,
      signal,
      checkpoint
    )
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${sourcePath}${suffix}`
      const exists = await lstat(sidecar).catch(() => null)
      if (!exists) continue
      if (exists.isSymbolicLink() || !exists.isFile()) {
        throw new Error('BROWSER_DATA_SOURCE_INVALID')
      }
      await copyBoundedRegularFile(
        sidecar,
        `${databasePath}${suffix}`,
        PLUGIN_BROWSER_DATA_MAX_SIDECAR_BYTES,
        signal,
        checkpoint
      )
    }
    return Object.freeze({ directory, databasePath })
  } catch (error) {
    try {
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 })
    } catch {
      throw Object.assign(new Error('BROWSER_DATA_TEMP_CLEANUP_FAILED'), {
        code: 'BROWSER_DATA_TEMP_CLEANUP_FAILED'
      })
    }
    throw error
  }
}

function parseJson(value: Buffer): unknown {
  try {
    return JSON.parse(value.toString('utf8'))
  } catch {
    throw Object.assign(new Error('BROWSER_DATA_PARSE_FAILED'), {
      code: 'BROWSER_DATA_PARSE_FAILED'
    })
  }
}

function safeUrl(value: unknown): string | null {
  try {
    return validateUrl(value)
  } catch {
    return null
  }
}

function safeDisplay(value: unknown, maximumBytes: number, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  if (!normalized) return fallback
  let output = ''
  for (const character of normalized) {
    if (Buffer.byteLength(`${output}${character}`, 'utf8') > maximumBytes) break
    output += character
  }
  return output || fallback
}

function parseChromiumBookmarks(
  payload: unknown,
  file: ProfileFile,
  signal: AbortSignal
): PluginBrowserDataRecord[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('BROWSER_DATA_PARSE_FAILED')
  }
  const roots = (payload as { roots?: unknown }).roots
  if (!roots || typeof roots !== 'object' || Array.isArray(roots)) {
    throw new Error('BROWSER_DATA_PARSE_FAILED')
  }
  const records: PluginBrowserDataRecord[] = []
  const stack: Array<{ node: unknown; folders: readonly string[]; depth: number }> = []
  for (const root of Object.values(roots as Record<string, unknown>)) {
    stack.push({ node: root, folders: Object.freeze([]), depth: 0 })
  }
  let members = 0
  while (stack.length > 0) {
    assertSignal(signal)
    const current = stack.pop()!
    members += 1
    if (members > 10_000 || current.depth > 32) throw new Error('BROWSER_DATA_PARSE_FAILED')
    if (!current.node || typeof current.node !== 'object' || Array.isArray(current.node)) continue
    const node = current.node as Record<string, unknown>
    const url = safeUrl(node.url)
    if (node.type === 'url' && url) {
      records.push(
        Object.freeze({
          source: 'bookmarks',
          browser: file.definition.id,
          browserName: file.definition.name,
          profile: safeDisplay(file.profile, 128, 'Default'),
          title: safeDisplay(node.name, 512, url),
          url,
          folder: safeDisplay(current.folders.join(' / '), 512, '')
        })
      )
      if (records.length >= PLUGIN_BROWSER_DATA_MAX_ROWS_PER_PROFILE) break
      continue
    }
    const children = node.children
    if (!Array.isArray(children) || children.length > 10_000) continue
    const folder = safeDisplay(node.name, 128, '')
    const folders = folder ? Object.freeze([...current.folders, folder]) : current.folders
    for (let index = children.length - 1; index >= 0; index -= 1) {
      if (!Object.hasOwn(children, index)) throw new Error('BROWSER_DATA_PARSE_FAILED')
      stack.push({ node: children[index], folders, depth: current.depth + 1 })
    }
  }
  return records
}

function normalizeVisitedAt(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.max(0, Math.trunc((numeric - CHROMIUM_EPOCH_MICROS) / 1_000))
}

function recordsFromQuery(
  result: PluginSqliteQueryResult,
  file: ProfileFile
): PluginBrowserDataRecord[] {
  const rows = snapshotDenseArray(result.rows, PLUGIN_BROWSER_DATA_MAX_ROWS_PER_PROFILE + 1)
  if (rows.length > PLUGIN_BROWSER_DATA_MAX_ROWS_PER_PROFILE) {
    throw Object.assign(new Error('BROWSER_DATA_RESULT_LIMIT'), {
      code: 'BROWSER_DATA_RESULT_LIMIT'
    })
  }
  const output: PluginBrowserDataRecord[] = []
  const now = Date.now()
  for (const value of rows) {
    const row = exactRecord(value, ['url', 'title', 'folder', 'rawVisit'], ['url', 'title'])
    const url = safeUrl(row.url)
    if (!url) continue
    const source: PluginBrowserDataSourceId = 'history'
    const visitedAt = normalizeVisitedAt(row.rawVisit)
    if (visitedAt < now - HISTORY_WINDOW_MS || visitedAt > now) continue
    const base: PluginBrowserDataRecord = {
      source,
      browser: file.definition.id,
      browserName: file.definition.name,
      profile: safeDisplay(file.profile, 128, 'Default'),
      title: safeDisplay(row.title, 512, url),
      url,
      visitedAt
    }
    output.push(Object.freeze(base))
  }
  return output
}

function diagnostic(
  source: PluginBrowserDataSourceId,
  browser: PluginBrowserDataBrowserId,
  status: PluginBrowserDataDiagnostic['status'],
  code: PluginBrowserDataDiagnosticCode,
  profileCount: number,
  recordCount: number
): PluginBrowserDataDiagnostic {
  return Object.freeze({ source, browser, status, code, profileCount, recordCount })
}

function errorCode(error: unknown): PluginBrowserDataDiagnosticCode {
  const code =
    error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : ''
  if (code === 'BROWSER_DATA_SOURCE_TOO_LARGE') return 'BROWSER_DATA_SOURCE_TOO_LARGE'
  if (code === 'BROWSER_DATA_PARSE_FAILED') return 'BROWSER_DATA_PARSE_FAILED'
  if (code === 'BROWSER_DATA_RESULT_LIMIT') return 'BROWSER_DATA_RESULT_LIMIT'
  if (code === 'BROWSER_DATA_TEMP_CLEANUP_FAILED') return 'BROWSER_DATA_TEMP_CLEANUP_FAILED'
  return 'BROWSER_DATA_SOURCE_INVALID'
}

export function createFixedPluginBrowserDataQuery(
  run: PluginBrowserDataQuery
): PluginBrowserDataQuery {
  if (typeof run !== 'function' || utilTypes.isProxy(run)) invalid()
  const query: PluginBrowserDataQuery = async (databasePath, queryId, signal) => {
    assertSignal(signal)
    if (!path.isAbsolute(databasePath) || !Object.hasOwn(FIXED_QUERIES, queryId)) invalid()
    const result = await run(databasePath, queryId, signal)
    assertSignal(signal)
    return result
  }
  TRUSTED_QUERIES.add(query)
  return Object.freeze(query)
}

export function createPluginBrowserDataSqliteQuery(): PluginBrowserDataQuery {
  return createFixedPluginBrowserDataQuery(async (databasePath, queryId, signal) => {
    const client = new PluginSqliteWorkerClient(databasePath, {
      readOnly: true,
      queryTimeoutMs: 2_000
    })
    let removeAbort = (): void => undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      const onAbort = (): void => {
        void client.close()
        reject(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      removeAbort = () => signal.removeEventListener('abort', onAbort)
    })
    const query = client.query(FIXED_QUERIES[queryId], [])
    void query.catch(() => undefined)
    try {
      return await Promise.race([query, aborted])
    } finally {
      removeAbort()
      await client.close()
    }
  })
}

export function createFixedPluginBrowserDataService(
  rawOptions: FixedPluginBrowserDataServiceOptions
): TrustedPluginBrowserDataService {
  const options = exactRecord(rawOptions, [
    'platform',
    'homeDirectory',
    'appDataDirectory',
    'tempDirectory',
    'query'
  ])
  if (
    typeof options.platform !== 'string' ||
    typeof options.homeDirectory !== 'string' ||
    typeof options.appDataDirectory !== 'string' ||
    typeof options.tempDirectory !== 'string' ||
    !path.isAbsolute(options.homeDirectory) ||
    !path.isAbsolute(options.appDataDirectory) ||
    !path.isAbsolute(options.tempDirectory) ||
    typeof options.query !== 'function' ||
    !TRUSTED_QUERIES.has(options.query)
  ) {
    invalid()
  }
  const platform = options.platform as NodeJS.Platform
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  const homeDirectory = pathApi.normalize(options.homeDirectory)
  const appDataDirectory = pathApi.normalize(options.appDataDirectory)
  const tempDirectory = path.normalize(options.tempDirectory)
  const query = options.query as PluginBrowserDataQuery
  const browserDefinitions = definitionsFor(platform, homeDirectory, appDataDirectory)
  const trustedParents = Object.freeze([homeDirectory, appDataDirectory])

  const scanFile = async (
    file: ProfileFile,
    signal: AbortSignal,
    checkpoint: () => void
  ): Promise<PluginBrowserDataRecord[]> => {
    checkpoint()
    if (file.schema === 'chromium-bookmarks') {
      const payload = await readBoundedRegularFile(
        file.filePath,
        PLUGIN_BROWSER_DATA_MAX_BOOKMARK_BYTES,
        signal,
        checkpoint
      )
      checkpoint()
      return parseChromiumBookmarks(parseJson(payload), file, signal)
    }
    let temporary: { readonly directory: string; readonly databasePath: string } | null = null
    let records: PluginBrowserDataRecord[] | undefined
    let failure: unknown
    try {
      temporary = await createTemporaryDatabaseCopy(
        file.filePath,
        tempDirectory,
        signal,
        checkpoint
      )
      checkpoint()
      const result = await query(temporary.databasePath, file.schema, signal)
      checkpoint()
      records = recordsFromQuery(result, file)
    } catch (error) {
      failure = error
    }
    if (temporary) {
      try {
        await rm(temporary.directory, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 25
        })
      } catch {
        throw Object.assign(new Error('BROWSER_DATA_TEMP_CLEANUP_FAILED'), {
          code: 'BROWSER_DATA_TEMP_CLEANUP_FAILED'
        })
      }
    }
    if (failure) throw failure
    return records ?? []
  }

  const scan = async (
    request: BrowserDataScanRequest,
    signal: AbortSignal,
    checkpoint: () => void
  ): Promise<PluginBrowserDataScanResult> => {
    assertSignal(signal)
    if (!['darwin', 'win32', 'linux'].includes(platform)) {
      return Object.freeze({
        operation: 'scan',
        status: 'blocked',
        code: 'BROWSER_DATA_PLATFORM_UNSUPPORTED',
        records: EMPTY_RESULT_LIST,
        diagnostics: EMPTY_RESULT_LIST
      })
    }
    await mkdir(tempDirectory, { recursive: true })
    checkpoint()
    const requestedBrowsers = request.browser ? [request.browser] : [...BROWSER_IDS]
    const records: PluginBrowserDataRecord[] = []
    const diagnostics: PluginBrowserDataDiagnostic[] = []
    for (const browser of requestedBrowsers) {
      const definition = browserDefinitions.find((candidate) => candidate.id === browser)
      for (const source of request.sources) {
        assertSignal(signal)
        if (!definition) {
          diagnostics.push(
            diagnostic(source, browser, 'unsupported', 'BROWSER_DATA_PLATFORM_UNSUPPORTED', 0, 0)
          )
          continue
        }
        const files = await discoverProfileFiles(
          definition,
          source,
          trustedParents,
          pathApi,
          signal,
          checkpoint
        )
        if (files.length === 0) {
          diagnostics.push(diagnostic(source, browser, 'not-found', 'BROWSER_DATA_NOT_FOUND', 0, 0))
          continue
        }
        let succeeded = 0
        let failed = 0
        let sourceRecords = 0
        let lastCode: PluginBrowserDataDiagnosticCode = 'BROWSER_DATA_OK'
        for (const file of files) {
          try {
            const next = await scanFile(file, signal, checkpoint)
            checkpoint()
            succeeded += 1
            for (const record of next) {
              if (records.length >= PLUGIN_BROWSER_DATA_MAX_RECORDS) {
                lastCode = 'BROWSER_DATA_RESULT_LIMIT'
                break
              }
              records.push(record)
              sourceRecords += 1
            }
          } catch (error) {
            if (error instanceof PluginHostCapabilityError) throw error
            failed += 1
            lastCode =
              error &&
              typeof error === 'object' &&
              (error as { code?: unknown }).code === 'BROWSER_DATA_SCHEMA_UNSUPPORTED'
                ? 'BROWSER_DATA_SCHEMA_UNSUPPORTED'
                : file.schema === 'chromium-bookmarks'
                  ? errorCode(error)
                  : errorCode(error) === 'BROWSER_DATA_SOURCE_INVALID'
                    ? 'BROWSER_DATA_QUERY_FAILED'
                    : errorCode(error)
          }
        }
        const status: PluginBrowserDataDiagnostic['status'] =
          succeeded > 0 && failed > 0
            ? 'partial'
            : succeeded > 0
              ? 'available'
              : lastCode === 'BROWSER_DATA_SCHEMA_UNSUPPORTED'
                ? 'unsupported'
                : 'failed'
        diagnostics.push(
          diagnostic(
            source,
            browser,
            status,
            status === 'available' ? 'BROWSER_DATA_OK' : lastCode,
            files.length,
            sourceRecords
          )
        )
      }
    }
    checkpoint()
    return validateResult({
      operation: 'scan',
      status: 'completed',
      records: Object.freeze(records),
      diagnostics: Object.freeze(diagnostics)
    })
  }

  const service = Object.freeze({ platform, scan })
  TRUSTED_SERVICES.add(service)
  return service
}

export function createPluginBrowserDataCapabilities(
  rawOptions: PluginBrowserDataCapabilitiesOptions
): PluginBrowserDataCapabilities {
  const options = exactRecord(rawOptions, [
    'activation',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'resolveEnabledSources',
    'authorizeRead',
    'authorizeIndex',
    'watchReadPermissionRevoked',
    'watchIndexPermissionRevoked',
    'service'
  ])
  const functionKeys = [
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'resolveEnabledSources',
    'authorizeRead',
    'authorizeIndex',
    'watchReadPermissionRevoked',
    'watchIndexPermissionRevoked'
  ] as const
  for (const key of functionKeys) {
    if (typeof options[key] !== 'function' || utilTypes.isProxy(options[key])) invalid()
  }
  if (
    !options.service ||
    typeof options.service !== 'object' ||
    !TRUSTED_SERVICES.has(options.service)
  ) {
    invalid()
  }
  const expectedActivation = snapshotActivation(options.activation)
  if (expectedActivation.name !== 'touch-browser-data') invalid()
  const service = options.service as TrustedPluginBrowserDataService
  const scanService = dataMethod<TrustedPluginBrowserDataService['scan']>(service, 'scan')
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginBrowserDataCapabilitiesOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginBrowserDataCapabilitiesOptions['resolveHostGeneration']
  const resolveEnabledSources =
    options.resolveEnabledSources as PluginBrowserDataCapabilitiesOptions['resolveEnabledSources']
  const authorizeRead =
    options.authorizeRead as PluginBrowserDataCapabilitiesOptions['authorizeRead']
  const authorizeIndex =
    options.authorizeIndex as PluginBrowserDataCapabilitiesOptions['authorizeIndex']
  const watchRead =
    options.watchReadPermissionRevoked as PluginBrowserDataCapabilitiesOptions['watchReadPermissionRevoked']
  const watchIndex =
    options.watchIndexPermissionRevoked as PluginBrowserDataCapabilitiesOptions['watchIndexPermissionRevoked']
  const permissionDisposers: Array<() => void> = []
  const controllers = new Set<AbortController>()
  const operations = new Set<Promise<void>>()
  let readWatcherAvailable = true
  let indexWatcherAvailable = true
  let readRevoked = false
  let indexRevoked = false
  let closed = false
  let closePromise: Promise<void> | null = null

  const abortAll = (): void => {
    for (const controller of controllers) controller.abort()
  }
  const revoke = (permission: 'read' | 'index'): void => {
    if (permission === 'read') readRevoked = true
    else indexRevoked = true
    abortAll()
  }
  try {
    const dispose = watchRead.call(rawOptions, expectedActivation.name, () => revoke('read'))
    if (typeof dispose !== 'function' || utilTypes.isProxy(dispose)) invalid()
    permissionDisposers.push(dispose)
  } catch {
    readWatcherAvailable = false
  }
  try {
    const dispose = watchIndex.call(rawOptions, expectedActivation.name, () => revoke('index'))
    if (typeof dispose !== 'function' || utilTypes.isProxy(dispose)) invalid()
    permissionDisposers.push(dispose)
  } catch {
    indexWatcherAvailable = false
  }

  const assertAuthority = (context: PluginSecurityContext): void => {
    if (!isAuthoritativePluginContext(context)) invalid()
    const identity = context.identity
    if (
      identity.authority !== 'plugin-host' ||
      identity.pluginName !== expectedActivation.name ||
      context.name !== expectedActivation.name ||
      identity.pluginInstanceId !== expectedActivation.pluginInstanceId ||
      identity.activationGeneration !== expectedActivation.activationGeneration ||
      context.uniqueKey !== expectedActivation.key ||
      !Number.isSafeInteger(identity.hostGeneration) ||
      Number(identity.hostGeneration) < 1
    ) {
      invalid()
    }
    const current = resolveCurrentActivation.call(rawOptions, expectedActivation.name)
    if (
      !current ||
      !sameActivation(snapshotActivation(current), expectedActivation) ||
      resolveHostGeneration.call(rawOptions, expectedActivation) !== identity.hostGeneration
    ) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
  }

  const permission = (kind: 'read' | 'index'): 'allowed' | 'denied' | 'unavailable' => {
    if (kind === 'read' && !readWatcherAvailable) return 'unavailable'
    if (kind === 'index' && !indexWatcherAvailable) return 'unavailable'
    if ((kind === 'read' && readRevoked) || (kind === 'index' && indexRevoked)) return 'denied'
    try {
      const result =
        kind === 'read'
          ? authorizeRead.call(rawOptions, expectedActivation.name)
          : authorizeIndex.call(rawOptions, expectedActivation.name)
      return typeof result !== 'boolean' ? 'unavailable' : result ? 'allowed' : 'denied'
    } catch {
      return 'unavailable'
    }
  }

  const assertAdmission = (
    context: PluginSecurityContext,
    signal: AbortSignal,
    requireIndex: boolean
  ): void => {
    assertSignal(signal)
    assertAuthority(context)
    if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    for (const kind of requireIndex ? (['read', 'index'] as const) : (['read'] as const)) {
      const decision = permission(kind)
      if (decision === 'denied') {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
      }
      if (decision === 'unavailable') {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
      }
    }
  }

  const definition: PluginHostCapabilityDefinition = Object.freeze({
    id: 'browser-data.scan',
    permission: 'fs.read',
    timeoutMs: PLUGIN_BROWSER_DATA_TIMEOUT_MS,
    maxConcurrency: 1,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest,
    validateResult,
    async invoke(context, request, signal) {
      const normalized = request as BrowserDataScanRequest
      assertAdmission(context, signal, false)
      let enabled: readonly PluginBrowserDataSourceId[]
      try {
        enabled = resolveEnabledSources.call(rawOptions, expectedActivation.name)
      } catch {
        enabled = Object.freeze([])
      }
      const enabledSet = new Set(
        snapshotDenseArray(enabled, SOURCE_IDS.length).filter(
          (value): value is PluginBrowserDataSourceId =>
            typeof value === 'string' && SOURCE_ID_SET.has(value)
        )
      )
      const sources = normalized.sources.filter((source) => enabledSet.has(source))
      if (sources.length === 0) {
        return Object.freeze({
          operation: 'scan',
          status: 'blocked',
          code: 'BROWSER_DATA_SOURCE_DISABLED',
          records: Object.freeze([]),
          diagnostics: Object.freeze([])
        })
      }
      const requireIndex = sources.includes('history')
      assertAdmission(context, signal, requireIndex)
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
        const effectiveRequest = Object.freeze({
          ...normalized,
          sources: Object.freeze(sources)
        })
        const checkpoint = (): void => assertAdmission(context, controller.signal, requireIndex)
        const result = await scanService.call(
          service,
          effectiveRequest,
          controller.signal,
          checkpoint
        )
        checkpoint()
        return validateResult(result)
      } finally {
        signal.removeEventListener('abort', onAbort)
        controllers.delete(controller)
        operations.delete(operation)
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
