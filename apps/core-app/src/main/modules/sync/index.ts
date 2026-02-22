import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { ITouchEvent } from '@talex-touch/utils/eventbus'
import type {
  EvictedDeviceInfo,
  SyncItemInput,
  SyncItemOutput
} from '@talex-touch/utils/types/cloud-sync'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { createHash } from 'node:crypto'
import { CloudSyncError, CloudSyncSDK, StorageList } from '@talex-touch/utils'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'
import { getLogger } from '@talex-touch/utils/common/logger'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffBaseUrl, isDevEnv } from '@talex-touch/utils/env'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { BaseModule } from '../abstract-base-module'
import {
  getConfig as getMainStorageConfig,
  getMainConfig,
  storageModule,
  saveConfig,
  saveMainConfig,
  subscribeMainConfig
} from '../storage'
import { pluginModule } from '../plugin/plugin-module'
import { TouchPlugin } from '../plugin/plugin'
import {
  PluginStorageUpdatedEvent,
  TalexEvents as TouchEvents,
  touchEventBus
} from '../../core/eventbus/touch-event'

const syncLog = getLogger('sync')

const STORAGE_ITEM_PREFIX = 'storage::'
const STORAGE_ITEM_TYPE = 'storage.snapshot'
const STORAGE_SCHEMA_VERSION = 1
const PLUGIN_SYNC_QUALIFIED_PREFIX = 'plugin::'
const PLUGIN_SYNC_ALL_SCOPE = `${PLUGIN_SYNC_QUALIFIED_PREFIX}__all__`

const AUTO_PULL_TASK_ID = 'main.sync.auto-pull'
const AUTO_PULL_INTERVAL_MINUTES = 10
const PUSH_DEBOUNCE_MS = 10_000
const LARGE_BLOB_BATCH_MS = 60_000
const LARGE_PAYLOAD_THRESHOLD_BYTES = 64 * 1024
const STARTUP_PULL_TIMEOUT_MS = 8_000
const NORMAL_PULL_TIMEOUT_MS = 20_000
const RETRY_BACKOFF_MS = [5_000, 30_000, 120_000, 300_000, 600_000] as const

const LOCAL_AUTH_BASE_URL = 'http://localhost:3200'

const SYNC_STORAGE_KEYS = [
  StorageList.APP_SETTING,
  StorageList.OPENERS,
  StorageList.IntelligenceConfig,
  StorageList.MARKET_SOURCES,
  'intelligence/prompt-library',
  'division-box/preferences'
]

type SyncPreferenceState = typeof appSettingOriginData.sync

type SyncRuntimeStatus = SyncPreferenceState['status']

type SyncBlockedReason = SyncPreferenceState['blockedReason']

const DEFAULT_SYNC_PREFERENCE: SyncPreferenceState = JSON.parse(
  JSON.stringify(appSettingOriginData.sync)
) as SyncPreferenceState

const pollingService = PollingService.getInstance()

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const dirtyStorages = new Set<string>()
const pendingBlobStorages = new Set<string>()
const knownPluginQualifiedNames = new Set<string>()
const storageWatchers = new Map<string, () => void>()
const remoteApplyInFlight = new Set<string>()
const lastSyncedSnapshots = new Map<string, unknown>()

let started = false
let sdk: CloudSyncSDK | null = null
let pullPromise: Promise<boolean> | null = null
let pushPromise: Promise<boolean> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let blobBatchTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pluginStorageListenerBound = false
let transport: ITuffTransportMain | null = null
let requestRendererValue: (<T>(eventName: string) => Promise<T | null>) | null = null
let syncEnabledWatcherCleanup: (() => void) | null = null

const syncStartEvent = defineRawEvent<{ reason?: string }, { success: boolean }>('sync:start')
const syncStopEvent = defineRawEvent<{ reason?: string }, { success: boolean }>('sync:stop')
const syncTriggerEvent = defineRawEvent<
  { reason?: 'user' | 'focus' | 'online' },
  { success: boolean }
>('sync:trigger')
const authTokenUpdatedEvent = defineRawEvent<{ status?: 'set' | 'cleared' }, void>(
  'auth:token-updated'
)

function isSyncStorageKey(name: string): boolean {
  return SYNC_STORAGE_KEYS.includes(name)
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64')
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

function encodeSyncPayload(rawText: string): string {
  const bytes = textEncoder.encode(rawText)
  return `b64:${toBase64(bytes)}`
}

function decodeSyncPayload(payloadEnc: string): string {
  const normalized = payloadEnc.trim()
  if (!normalized) {
    return ''
  }
  if (!normalized.startsWith('b64:')) {
    return normalized
  }
  const base64 = normalized.slice(4)
  return textDecoder.decode(fromBase64(base64))
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // fall through
    }
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

function normalizeStatus(value: unknown): SyncRuntimeStatus {
  if (value === 'idle' || value === 'syncing' || value === 'paused' || value === 'error') {
    return value
  }
  return DEFAULT_SYNC_PREFERENCE.status
}

function normalizeBlockedReason(value: unknown): SyncBlockedReason {
  if (value === '' || value === 'quota' || value === 'device' || value === 'auth') {
    return value
  }
  return DEFAULT_SYNC_PREFERENCE.blockedReason
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeSyncPreference(value: unknown): SyncPreferenceState {
  if (!value || typeof value !== 'object') {
    return cloneValue(DEFAULT_SYNC_PREFERENCE)
  }
  const sync = value as Partial<SyncPreferenceState>
  return {
    enabled: typeof sync.enabled === 'boolean' ? sync.enabled : DEFAULT_SYNC_PREFERENCE.enabled,
    userOverridden:
      typeof sync.userOverridden === 'boolean'
        ? sync.userOverridden
        : DEFAULT_SYNC_PREFERENCE.userOverridden,
    autoEnabledAt:
      typeof sync.autoEnabledAt === 'string'
        ? sync.autoEnabledAt
        : DEFAULT_SYNC_PREFERENCE.autoEnabledAt,
    lastActivityAt:
      typeof sync.lastActivityAt === 'string'
        ? sync.lastActivityAt
        : DEFAULT_SYNC_PREFERENCE.lastActivityAt,
    lastPushAt:
      typeof sync.lastPushAt === 'string' ? sync.lastPushAt : DEFAULT_SYNC_PREFERENCE.lastPushAt,
    lastPullAt:
      typeof sync.lastPullAt === 'string' ? sync.lastPullAt : DEFAULT_SYNC_PREFERENCE.lastPullAt,
    status: normalizeStatus(sync.status),
    lastSuccessAt:
      typeof sync.lastSuccessAt === 'string'
        ? sync.lastSuccessAt
        : DEFAULT_SYNC_PREFERENCE.lastSuccessAt,
    lastErrorAt:
      typeof sync.lastErrorAt === 'string' ? sync.lastErrorAt : DEFAULT_SYNC_PREFERENCE.lastErrorAt,
    lastErrorCode:
      typeof sync.lastErrorCode === 'string'
        ? sync.lastErrorCode
        : DEFAULT_SYNC_PREFERENCE.lastErrorCode,
    lastErrorMessage:
      typeof sync.lastErrorMessage === 'string'
        ? sync.lastErrorMessage
        : DEFAULT_SYNC_PREFERENCE.lastErrorMessage,
    consecutiveFailures: normalizeNumber(
      sync.consecutiveFailures,
      DEFAULT_SYNC_PREFERENCE.consecutiveFailures
    ),
    queueDepth: normalizeNumber(sync.queueDepth, DEFAULT_SYNC_PREFERENCE.queueDepth),
    nextPullAt:
      typeof sync.nextPullAt === 'string' ? sync.nextPullAt : DEFAULT_SYNC_PREFERENCE.nextPullAt,
    cursor: normalizeNumber(sync.cursor, DEFAULT_SYNC_PREFERENCE.cursor),
    opSeq: normalizeNumber(sync.opSeq, DEFAULT_SYNC_PREFERENCE.opSeq),
    lastConflictAt:
      typeof sync.lastConflictAt === 'string'
        ? sync.lastConflictAt
        : DEFAULT_SYNC_PREFERENCE.lastConflictAt,
    lastConflictCount: normalizeNumber(
      sync.lastConflictCount,
      DEFAULT_SYNC_PREFERENCE.lastConflictCount
    ),
    blockedReason: normalizeBlockedReason(sync.blockedReason)
  }
}

function getSyncPreferenceState(): SyncPreferenceState {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  return normalizeSyncPreference(appSettings.sync)
}

function updateSyncPreferenceState(patch: Partial<SyncPreferenceState>): SyncPreferenceState {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  const current = normalizeSyncPreference(appSettings.sync)
  const next = { ...current, ...patch }
  appSettings.sync = next
  saveMainConfig(StorageList.APP_SETTING, appSettings)
  return next
}

function nowIso(): string {
  return new Date().toISOString()
}

function setSyncStatus(status: SyncRuntimeStatus): void {
  updateSyncPreferenceState({ status })
}

function setSyncQueueDepth(depth: number): void {
  updateSyncPreferenceState({ queueDepth: Math.max(0, Math.floor(depth)) })
}

function setNextPullAt(value: string): void {
  updateSyncPreferenceState({ nextPullAt: value })
}

function setSyncCursor(cursor: number): void {
  updateSyncPreferenceState({ cursor: Math.max(0, Math.floor(cursor)) })
}

function nextSyncOpSeq(): number {
  const sync = getSyncPreferenceState()
  const next = Math.max(0, Math.floor(sync.opSeq || 0)) + 1
  updateSyncPreferenceState({ opSeq: next })
  return next
}

function markSyncPushSuccess(): void {
  const stamp = nowIso()
  updateSyncPreferenceState({
    lastPushAt: stamp,
    lastSuccessAt: stamp,
    lastActivityAt: stamp,
    status: 'idle',
    lastErrorAt: '',
    lastErrorCode: '',
    lastErrorMessage: '',
    blockedReason: '',
    consecutiveFailures: 0
  })
}

function markSyncPullSuccess(): void {
  const stamp = nowIso()
  updateSyncPreferenceState({
    lastPullAt: stamp,
    lastSuccessAt: stamp,
    lastActivityAt: stamp,
    status: 'idle',
    lastErrorAt: '',
    lastErrorCode: '',
    lastErrorMessage: '',
    blockedReason: '',
    consecutiveFailures: 0
  })
}

function markSyncConflict(count: number): void {
  if (count <= 0) {
    return
  }
  updateSyncPreferenceState({
    lastConflictAt: nowIso(),
    lastConflictCount: count
  })
}

function clearSyncError(): void {
  updateSyncPreferenceState({
    status: 'idle',
    lastErrorAt: '',
    lastErrorCode: '',
    lastErrorMessage: '',
    blockedReason: '',
    consecutiveFailures: 0
  })
}

function markSyncError(payload: {
  code: string
  message: string
  blockedReason?: SyncBlockedReason
  status?: SyncRuntimeStatus
}): number {
  const sync = getSyncPreferenceState()
  const failures = Math.max(0, Math.floor(sync.consecutiveFailures || 0)) + 1
  updateSyncPreferenceState({
    status: payload.status ?? 'error',
    lastErrorAt: nowIso(),
    lastErrorCode: payload.code,
    lastErrorMessage: payload.message,
    blockedReason: payload.blockedReason ?? sync.blockedReason ?? '',
    consecutiveFailures: failures
  })
  return failures
}

function resolveAuthBaseUrl(): string {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  const localAuth = isDevEnv() && appSettings?.dev && appSettings.dev.authServer === 'local'
  return localAuth ? LOCAL_AUTH_BASE_URL : getTuffBaseUrl()
}

async function resolveRendererValue<T>(eventName: string): Promise<T | null> {
  if (!requestRendererValue) {
    return null
  }
  return await requestRendererValue<T>(eventName)
}

async function resolveAuthToken(): Promise<string | null> {
  return await resolveRendererValue<string>('account:get-auth-token')
}

async function resolveDeviceId(): Promise<string | null> {
  return await resolveRendererValue<string>('account:get-device-id')
}

function resolveSdk(): CloudSyncSDK {
  if (sdk) {
    return sdk
  }

  sdk = new CloudSyncSDK({
    baseUrl: resolveAuthBaseUrl(),
    getAuthToken: async () => {
      const token = await resolveAuthToken()
      if (!token) {
        throw new Error('AUTH_MISSING')
      }
      return token
    },
    getDeviceId: async () => {
      const deviceId = await resolveDeviceId()
      if (!deviceId) {
        throw new Error('DEVICE_ID_MISSING')
      }
      return deviceId
    },
    onHandshake: (response) => {
      const evicted = Array.isArray(response.evicted_devices)
        ? response.evicted_devices.filter(Boolean)
        : []
      if (evicted.length > 0) {
        logDeviceEvicted(evicted)
      }
    }
  })

  return sdk
}

function logDeviceEvicted(devices: EvictedDeviceInfo[]): void {
  const count = devices.length
  if (!Number.isFinite(count) || count <= 0) {
    return
  }
  const labels = devices
    .map((device) => {
      const name = typeof device.device_name === 'string' ? device.device_name.trim() : ''
      const platform = typeof device.platform === 'string' ? device.platform.trim() : ''
      return name || platform || 'unknown'
    })
    .filter((label) => label)
  syncLog.warn('Sync evicted device(s)', { meta: { count, devices: labels } })
}

function setQueueDepthByBuffers(): void {
  const total = dirtyStorages.size + pendingBlobStorages.size
  setSyncQueueDepth(total)
}

function clearPushTimers(): void {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  if (blobBatchTimer) {
    clearTimeout(blobBatchTimer)
    blobBatchTimer = null
  }
}

function clearRetryTimer(): void {
  if (!retryTimer) {
    return
  }
  clearTimeout(retryTimer)
  retryTimer = null
}

function scheduleDebouncedPush(): void {
  if (pushTimer) {
    clearTimeout(pushTimer)
  }
  pushTimer = setTimeout(() => {
    pushTimer = null
    void performPush('debounce')
  }, PUSH_DEBOUNCE_MS)
}

function scheduleBlobBatchPush(): void {
  if (!pendingBlobStorages.size) {
    return
  }
  if (blobBatchTimer) {
    return
  }
  blobBatchTimer = setTimeout(() => {
    blobBatchTimer = null
    void performPush('blob-batch', true)
  }, LARGE_BLOB_BATCH_MS)
}

function isPluginStorageQualifiedName(value: string): boolean {
  return value.startsWith(PLUGIN_SYNC_QUALIFIED_PREFIX)
}

function isPluginScopeMarker(qualifiedName: string): boolean {
  return qualifiedName === PLUGIN_SYNC_ALL_SCOPE || qualifiedName.endsWith('::')
}

function buildPluginStorageQualifiedName(pluginName: string, fileName?: string): string {
  const normalizedPluginName = pluginName.trim()
  const normalizedFileName = typeof fileName === 'string' ? fileName.trim() : ''
  if (!normalizedPluginName) {
    return ''
  }
  return normalizedFileName
    ? `${PLUGIN_SYNC_QUALIFIED_PREFIX}${normalizedPluginName}::${normalizedFileName}`
    : `${PLUGIN_SYNC_QUALIFIED_PREFIX}${normalizedPluginName}::`
}

function parsePluginStorageQualifiedName(
  qualifiedName: string
): { pluginName: string; fileName?: string } | null {
  const normalized = qualifiedName.trim()
  if (!isPluginStorageQualifiedName(normalized) || normalized === PLUGIN_SYNC_ALL_SCOPE) {
    return null
  }

  const body = normalized.slice(PLUGIN_SYNC_QUALIFIED_PREFIX.length)
  const separatorIndex = body.indexOf('::')
  if (separatorIndex < 0) {
    return null
  }

  const pluginName = body.slice(0, separatorIndex).trim()
  const fileName = body.slice(separatorIndex + 2).trim()
  if (!pluginName) {
    return null
  }

  return {
    pluginName,
    fileName: fileName || undefined
  }
}

function extractQualifiedName(item: SyncItemOutput): string {
  const fromMeta =
    item.meta_plain && typeof item.meta_plain === 'object' && 'qualified_name' in item.meta_plain
      ? String((item.meta_plain as { qualified_name?: unknown }).qualified_name ?? '').trim()
      : ''
  if (fromMeta) {
    return fromMeta
  }

  if (!item.item_id.startsWith(STORAGE_ITEM_PREFIX)) {
    return ''
  }
  return item.item_id.slice(STORAGE_ITEM_PREFIX.length).trim()
}

function extractContentHash(item: SyncItemOutput): string {
  if (!item.meta_plain || typeof item.meta_plain !== 'object') {
    return ''
  }

  const hash = (item.meta_plain as { content_hash?: unknown }).content_hash
  return typeof hash === 'string' ? hash.trim() : ''
}

async function resolvePayloadText(
  item: SyncItemOutput,
  client: CloudSyncSDK
): Promise<string | null> {
  if (item.payload_enc) {
    return decodeSyncPayload(item.payload_enc)
  }

  if (!item.payload_ref || !item.payload_ref.startsWith('blob:')) {
    return null
  }

  const blobId = item.payload_ref.slice('blob:'.length).trim()
  if (!blobId) {
    return null
  }

  const blob = await client.downloadBlob(blobId)
  return decodeSyncPayload(textDecoder.decode(new Uint8Array(blob.data)))
}

function buildSyncItemFromSnapshot(
  snapshot: StorageSyncSnapshot,
  opSeq: number,
  updatedAt: string
): SyncItemInput {
  return {
    item_id: snapshot.itemId,
    type: STORAGE_ITEM_TYPE,
    schema_version: STORAGE_SCHEMA_VERSION,
    payload_enc: snapshot.payloadEnc,
    payload_ref: null,
    meta_plain: {
      qualified_name: snapshot.qualifiedName,
      schema_version: STORAGE_SCHEMA_VERSION,
      payload_size: snapshot.payloadSize,
      content_hash: snapshot.contentHash
    },
    payload_size: snapshot.payloadSize,
    updated_at: updatedAt,
    deleted_at: null,
    op_seq: opSeq,
    op_hash: snapshot.contentHash,
    op_type: 'upsert'
  }
}

function buildBlobSyncItem(
  snapshot: StorageSyncSnapshot,
  opSeq: number,
  updatedAt: string,
  blobId: string
): SyncItemInput {
  return {
    item_id: snapshot.itemId,
    type: STORAGE_ITEM_TYPE,
    schema_version: STORAGE_SCHEMA_VERSION,
    payload_enc: null,
    payload_ref: `blob:${blobId}`,
    meta_plain: {
      qualified_name: snapshot.qualifiedName,
      schema_version: STORAGE_SCHEMA_VERSION,
      payload_size: snapshot.payloadSize,
      content_hash: snapshot.contentHash
    },
    payload_size: snapshot.payloadSize,
    updated_at: updatedAt,
    deleted_at: null,
    op_seq: opSeq,
    op_hash: snapshot.contentHash,
    op_type: 'upsert'
  }
}

function buildDeletedSyncItem(
  qualifiedName: string,
  opSeq: number,
  updatedAt: string,
  opHash: string
): SyncItemInput {
  return {
    item_id: `${STORAGE_ITEM_PREFIX}${qualifiedName}`,
    type: STORAGE_ITEM_TYPE,
    schema_version: STORAGE_SCHEMA_VERSION,
    payload_enc: null,
    payload_ref: null,
    meta_plain: {
      qualified_name: qualifiedName,
      schema_version: STORAGE_SCHEMA_VERSION,
      payload_size: 0,
      content_hash: opHash
    },
    payload_size: 0,
    updated_at: updatedAt,
    deleted_at: updatedAt,
    op_seq: opSeq,
    op_hash: opHash,
    op_type: 'delete'
  }
}

function buildDeleteOpHash(qualifiedName: string, updatedAt: string): string {
  return `delete:${qualifiedName}:${updatedAt}`
}

interface StorageSyncSnapshot {
  qualifiedName: string
  itemId: string
  payloadEnc: string
  payloadSize: number
  contentHash: string
  rawText: string
}

function getPluginManager() {
  return pluginModule.pluginManager
}

function getPluginStorageContent(
  qualifiedName: string
): { plugin: TouchPlugin; fileName: string; content: unknown } | null {
  const parsed = parsePluginStorageQualifiedName(qualifiedName)
  if (!parsed || !parsed.fileName) {
    return null
  }
  const manager = getPluginManager()
  if (!manager) {
    return null
  }
  const plugin = manager.getPluginByName(parsed.pluginName) as TouchPlugin | undefined
  if (!plugin) {
    return null
  }
  return {
    plugin,
    fileName: parsed.fileName,
    content: plugin.getPluginFile(parsed.fileName)
  }
}

function collectPluginSyncItems(qualifiedNames?: string[]): Array<{
  pluginName: string
  fileName: string
  qualifiedName: string
  content: unknown
}> {
  const manager = getPluginManager()
  if (!manager) {
    return []
  }

  const requestedQualifiedNames = Array.isArray(qualifiedNames)
    ? qualifiedNames
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : []

  const requestedByPlugin = new Map<string, Set<string> | null>()
  for (const qualifiedName of requestedQualifiedNames) {
    const parsed = parsePluginStorageQualifiedName(qualifiedName)
    if (!parsed) {
      continue
    }
    if (!requestedByPlugin.has(parsed.pluginName)) {
      requestedByPlugin.set(parsed.pluginName, new Set())
    }
    const targetFiles = requestedByPlugin.get(parsed.pluginName)
    if (!targetFiles) {
      continue
    }
    if (parsed.fileName) {
      targetFiles.add(parsed.fileName)
    } else {
      requestedByPlugin.set(parsed.pluginName, null)
    }
  }

  const shouldReadAllPlugins = !requestedByPlugin.size
  const targetPluginNames = shouldReadAllPlugins
    ? Array.from(manager.plugins.keys())
    : Array.from(requestedByPlugin.keys())

  const items: Array<{
    pluginName: string
    fileName: string
    qualifiedName: string
    content: unknown
  }> = []

  for (const pluginName of targetPluginNames) {
    const plugin = manager.getPluginByName(pluginName) as TouchPlugin | undefined
    if (!plugin) {
      continue
    }
    const allowedFiles = requestedByPlugin.get(pluginName) ?? null
    const fileNames = plugin.listPluginFiles()
    for (const fileName of fileNames) {
      if (allowedFiles && !allowedFiles.has(fileName)) {
        continue
      }
      items.push({
        pluginName,
        fileName,
        qualifiedName: `${PLUGIN_SYNC_QUALIFIED_PREFIX}${pluginName}::${fileName}`,
        content: plugin.getPluginFile(fileName)
      })
    }
  }

  return items
}

async function collectStorageSnapshots(
  qualifiedNames?: Iterable<string>
): Promise<StorageSyncSnapshot[]> {
  const targetNames = qualifiedNames ? Array.from(new Set(qualifiedNames)) : [...SYNC_STORAGE_KEYS]
  const localTargetNames = targetNames.filter((name) => !isPluginStorageQualifiedName(name))
  const includeAllPluginItems = !qualifiedNames || targetNames.includes(PLUGIN_SYNC_ALL_SCOPE)
  const pluginTargetNames = includeAllPluginItems
    ? undefined
    : targetNames.filter((name) => isPluginStorageQualifiedName(name))

  const snapshots: StorageSyncSnapshot[] = []

  for (const qualifiedName of localTargetNames) {
    if (!isSyncStorageKey(qualifiedName)) {
      continue
    }
    const raw = getMainStorageConfig(qualifiedName)
    if (!raw || typeof raw !== 'object') {
      continue
    }

    const rawText = JSON.stringify(raw)
    const payloadEnc = encodeSyncPayload(rawText)
    const payloadSize = textEncoder.encode(payloadEnc).byteLength
    const contentHash = sha256Hex(rawText)

    snapshots.push({
      qualifiedName,
      itemId: `${STORAGE_ITEM_PREFIX}${qualifiedName}`,
      payloadEnc,
      payloadSize,
      contentHash,
      rawText
    })
  }

  if (includeAllPluginItems || (pluginTargetNames && pluginTargetNames.length > 0)) {
    const pluginItems = collectPluginSyncItems(pluginTargetNames)
    for (const item of pluginItems) {
      const normalizedQualifiedName = item.qualifiedName.trim()
      if (!normalizedQualifiedName || !isPluginStorageQualifiedName(normalizedQualifiedName)) {
        continue
      }
      const content = item.content && typeof item.content === 'object' ? item.content : {}
      const rawText = JSON.stringify(content)
      const payloadEnc = encodeSyncPayload(rawText)
      const payloadSize = textEncoder.encode(payloadEnc).byteLength
      const contentHash = sha256Hex(rawText)

      snapshots.push({
        qualifiedName: normalizedQualifiedName,
        itemId: `${STORAGE_ITEM_PREFIX}${normalizedQualifiedName}`,
        payloadEnc,
        payloadSize,
        contentHash,
        rawText
      })
    }
  }

  return snapshots
}

function buildPatch(base: unknown, current: unknown): StoragePatch {
  const patch: StoragePatch = { set: [], unset: [] }
  walkDiff(base, current, [], patch)
  return patch
}

function walkDiff(base: unknown, current: unknown, path: string[], patch: StoragePatch): void {
  if (isPlainObject(base) && isPlainObject(current)) {
    const baseKeys = Object.keys(base)
    const currentKeys = Object.keys(current)
    const currentSet = new Set(currentKeys)

    for (const key of baseKeys) {
      if (!currentSet.has(key) || (current as Record<string, unknown>)[key] === undefined) {
        patch.unset.push([...path, key])
      }
    }

    for (const key of currentKeys) {
      const currentValue = (current as Record<string, unknown>)[key]
      if (currentValue === undefined) {
        continue
      }
      if (!(key in (base as Record<string, unknown>))) {
        patch.set.push({ path: [...path, key], value: cloneValue(currentValue) })
        continue
      }
      walkDiff((base as Record<string, unknown>)[key], currentValue, [...path, key], patch)
    }
    return
  }

  if (isEqual(base, current)) {
    return
  }

  if (path.length > 0) {
    patch.set.push({ path: [...path], value: cloneValue(current) })
  }
}

function applyPatch(target: Record<string, unknown>, patch: StoragePatch): Record<string, unknown> {
  for (const path of patch.unset) {
    unsetByPath(target, path)
  }
  for (const entry of patch.set) {
    setByPath(target, entry.path, cloneValue(entry.value))
  }
  return target
}

function setByPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) {
    return
  }
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!key) {
      continue
    }
    const next = cursor[key]
    if (!isPlainObject(next)) {
      cursor[key] = {}
    }
    cursor = cursor[key] as Record<string, unknown>
  }
  const lastKey = path[path.length - 1]
  if (!lastKey) {
    return
  }
  cursor[lastKey] = value
}

function unsetByPath(target: Record<string, unknown>, path: string[]): void {
  if (path.length === 0) {
    return
  }
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!key) {
      return
    }
    const next = cursor[key]
    if (!isPlainObject(next)) {
      return
    }
    cursor = next as Record<string, unknown>
  }
  const lastKey = path[path.length - 1]
  if (!lastKey) {
    return
  }
  delete cursor[lastKey]
}

function isEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime()
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false
    }
    for (let i = 0; i < left.length; i++) {
      if (!isEqual(left[i], right[i])) {
        return false
      }
    }
    return true
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) {
      return false
    }
    for (const key of leftKeys) {
      if (
        !isEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])
      ) {
        return false
      }
    }
    return true
  }
  return false
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false
  }
  if (Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

interface StoragePatch {
  set: Array<{ path: string[]; value: unknown }>
  unset: Array<string[]>
}

function mergeLocalPatch(
  qualifiedName: string,
  remoteData: Record<string, unknown>
): {
  merged: Record<string, unknown>
  patched: boolean
} {
  if (!dirtyStorages.has(qualifiedName)) {
    return { merged: remoteData, patched: false }
  }
  const lastSnapshot = lastSyncedSnapshots.get(qualifiedName)
  if (!lastSnapshot || typeof lastSnapshot !== 'object') {
    return { merged: remoteData, patched: false }
  }
  const currentData = getMainStorageConfig(qualifiedName)
  if (!currentData || typeof currentData !== 'object') {
    return { merged: remoteData, patched: false }
  }
  const patch = buildPatch(lastSnapshot, currentData)
  const hasChanges = patch.set.length > 0 || patch.unset.length > 0
  if (!hasChanges) {
    return { merged: remoteData, patched: false }
  }
  const merged = applyPatch(cloneValue(remoteData) as Record<string, unknown>, patch)
  return { merged, patched: true }
}

async function applyPluginStorageSnapshot(
  qualifiedName: string,
  payloadText: string,
  expectedHash: string
): Promise<boolean> {
  const local = getPluginStorageContent(qualifiedName)
  if (!local) {
    return false
  }
  let parsedPayload: unknown
  try {
    parsedPayload = JSON.parse(payloadText)
  } catch (error) {
    syncLog.warn('Failed to parse plugin payload', { error, meta: { qualifiedName } })
    return false
  }

  try {
    const localText = JSON.stringify(
      local.content && typeof local.content === 'object' ? local.content : {}
    )
    if (localText === payloadText) {
      return false
    }
    if (expectedHash) {
      const localHash = sha256Hex(localText)
      if (localHash === expectedHash) {
        return false
      }
    }
  } catch (error) {
    syncLog.warn('Failed to compare local plugin payload', { error, meta: { qualifiedName } })
  }

  const result = local.plugin.savePluginFile(local.fileName, parsedPayload, { broadcast: false })
  if (result.success) {
    return true
  }
  syncLog.warn('Failed to apply plugin snapshot', {
    meta: { qualifiedName, error: result.error }
  })
  return false
}

async function applyPluginStorageDeletion(qualifiedName: string): Promise<boolean> {
  const local = getPluginStorageContent(qualifiedName)
  if (!local) {
    return false
  }
  const result = local.plugin.deletePluginFile(local.fileName, { broadcast: false })
  if (result.success) {
    return true
  }
  if (result.error === 'File not found') {
    return true
  }
  syncLog.warn('Failed to apply plugin deletion', {
    meta: { qualifiedName, error: result.error }
  })
  return false
}

async function applyPulledStorageItems(
  items: SyncItemOutput[],
  client: CloudSyncSDK
): Promise<number> {
  let appliedCount = 0

  for (const item of items) {
    if (item.type !== STORAGE_ITEM_TYPE) {
      continue
    }

    const qualifiedName = extractQualifiedName(item)
    if (!qualifiedName) {
      continue
    }

    if (isPluginStorageQualifiedName(qualifiedName)) {
      if (item.deleted_at) {
        const removed = await applyPluginStorageDeletion(qualifiedName)
        if (removed) {
          appliedCount += 1
        }
        continue
      }

      const payloadText = await resolvePayloadText(item, client)
      if (!payloadText) {
        continue
      }

      const applied = await applyPluginStorageSnapshot(
        qualifiedName,
        payloadText,
        extractContentHash(item)
      )
      if (applied) {
        appliedCount += 1
      }
      continue
    }

    if (item.deleted_at) {
      continue
    }

    const payloadText = await resolvePayloadText(item, client)
    if (!payloadText) {
      continue
    }

    try {
      const parsed = JSON.parse(payloadText) as Record<string, unknown>
      const { merged, patched } = mergeLocalPatch(qualifiedName, parsed)
      remoteApplyInFlight.add(qualifiedName)
      const result = saveConfig(qualifiedName, merged, false, true, undefined, undefined)
      remoteApplyInFlight.delete(qualifiedName)
      if (result.success) {
        lastSyncedSnapshots.set(qualifiedName, cloneValue(merged))
        if (patched) {
          dirtyStorages.add(qualifiedName)
          setQueueDepthByBuffers()
          scheduleDebouncedPush()
        } else {
          dirtyStorages.delete(qualifiedName)
          setQueueDepthByBuffers()
        }
      }
      appliedCount += 1
    } catch (error) {
      syncLog.warn('Failed to apply remote storage snapshot', {
        error,
        meta: { qualifiedName }
      })
    }
  }

  return appliedCount
}

function resolvePluginDeleteCandidates(
  scope: Set<string>,
  currentPluginQualifiedNames: Set<string>
): string[] {
  const deleted = new Set<string>()

  const collectByPlugin = (pluginName: string) => {
    for (const known of knownPluginQualifiedNames) {
      const parsed = parsePluginStorageQualifiedName(known)
      if (!parsed || parsed.pluginName !== pluginName) {
        continue
      }
      if (!currentPluginQualifiedNames.has(known)) {
        deleted.add(known)
      }
    }
  }

  for (const marker of scope) {
    const normalized = marker.trim()
    if (!isPluginScopeMarker(normalized)) {
      continue
    }

    if (normalized === PLUGIN_SYNC_ALL_SCOPE) {
      for (const known of knownPluginQualifiedNames) {
        if (!currentPluginQualifiedNames.has(known)) {
          deleted.add(known)
        }
      }
      continue
    }

    const parsedMarker = parsePluginStorageQualifiedName(normalized)
    if (!parsedMarker) {
      continue
    }
    if (parsedMarker.fileName) {
      if (
        knownPluginQualifiedNames.has(normalized) &&
        !currentPluginQualifiedNames.has(normalized)
      ) {
        deleted.add(normalized)
      }
      continue
    }
    collectByPlugin(parsedMarker.pluginName)
  }

  return Array.from(deleted)
}

function mergeKnownPluginQualifiedNamesFromPull(items: SyncItemOutput[]): void {
  for (const item of items) {
    if (!item.item_id.startsWith(STORAGE_ITEM_PREFIX)) {
      continue
    }

    const fromMeta =
      item.meta_plain &&
      typeof item.meta_plain === 'object' &&
      typeof (item.meta_plain as { qualified_name?: unknown }).qualified_name === 'string'
        ? String((item.meta_plain as { qualified_name: string }).qualified_name).trim()
        : ''
    const qualifiedName = fromMeta || item.item_id.slice(STORAGE_ITEM_PREFIX.length).trim()
    if (!isPluginStorageQualifiedName(qualifiedName)) {
      continue
    }

    if (item.deleted_at) {
      knownPluginQualifiedNames.delete(qualifiedName)
      continue
    }
    knownPluginQualifiedNames.add(qualifiedName)
  }
}

function markStorageDirty(qualifiedName: string): void {
  const normalized = qualifiedName.trim()
  if (!normalized) {
    return
  }
  if (remoteApplyInFlight.has(normalized)) {
    return
  }
  if (!isSyncStorageKey(normalized) && !isPluginStorageQualifiedName(normalized)) {
    return
  }
  if (!started || !getSyncPreferenceState().enabled) {
    return
  }
  dirtyStorages.add(normalized)
  setQueueDepthByBuffers()
  scheduleDebouncedPush()
}

function registerStorageWatchers(): void {
  for (const key of SYNC_STORAGE_KEYS) {
    if (storageWatchers.has(key)) {
      continue
    }
    let ready = false
    const unsubscribe = storageModule.subscribe(key, () => {
      if (!ready) {
        return
      }
      markStorageDirty(key)
    })
    ready = true
    storageWatchers.set(key, unsubscribe)
  }
}

function cleanupStorageWatchers(): void {
  for (const dispose of storageWatchers.values()) {
    dispose()
  }
  storageWatchers.clear()
}

function registerPluginStorageListener(): void {
  if (pluginStorageListenerBound) {
    return
  }
  touchEventBus.on(TouchEvents.PLUGIN_STORAGE_UPDATED, handlePluginStorageUpdate)
  pluginStorageListenerBound = true
}

function cleanupPluginStorageListener(): void {
  if (!pluginStorageListenerBound) {
    return
  }
  touchEventBus.off(TouchEvents.PLUGIN_STORAGE_UPDATED, handlePluginStorageUpdate)
  pluginStorageListenerBound = false
}

function handlePluginStorageUpdate(event: ITouchEvent<TalexEvents>): void {
  if (!started || !getSyncPreferenceState().enabled) {
    return
  }
  const storageEvent = event as PluginStorageUpdatedEvent
  const pluginName = storageEvent.pluginName?.trim()
  if (!pluginName) {
    markStorageDirty(PLUGIN_SYNC_ALL_SCOPE)
    return
  }
  const qualifiedName = buildPluginStorageQualifiedName(pluginName, storageEvent.fileName)
  if (qualifiedName) {
    markStorageDirty(qualifiedName)
    return
  }
  markStorageDirty(PLUGIN_SYNC_ALL_SCOPE)
}

function warmupKnownStorages(): void {
  for (const key of SYNC_STORAGE_KEYS) {
    try {
      const data = getMainStorageConfig(key)
      if (data && typeof data === 'object') {
        lastSyncedSnapshots.set(key, cloneValue(data))
      }
    } catch (error) {
      syncLog.warn('Failed to warmup sync storage', { error, meta: { key } })
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutCode: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null

  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutCode))
    }, ms)

    promise
      .then((value) => {
        if (timer) {
          clearTimeout(timer)
        }
        resolve(value)
      })
      .catch((error) => {
        if (timer) {
          clearTimeout(timer)
        }
        reject(error)
      })
  })
}

function resolveBlockedReasonFromCode(code: string): SyncBlockedReason {
  if (code.startsWith('QUOTA_')) {
    return 'quota'
  }
  if (code === 'DEVICE_NOT_AUTHORIZED') {
    return 'device'
  }
  if (code === 'SYNC_INVALID_TOKEN' || code === 'SYNC_TOKEN_EXPIRED' || code === 'AUTH_MISSING') {
    return 'auth'
  }
  return ''
}

function resolveErrorInfo(error: unknown): {
  code: string
  message: string
  blockedReason: SyncBlockedReason
} {
  if (error instanceof CloudSyncError) {
    const code = typeof error.errorCode === 'string' ? error.errorCode : 'SYNC_RUNTIME_ERROR'
    const payloadMessage =
      error.data && typeof error.data === 'object' && 'message' in error.data
        ? String((error.data as { message?: unknown }).message ?? '').trim()
        : ''
    const message = payloadMessage || error.message || code
    return {
      code,
      message,
      blockedReason: resolveBlockedReasonFromCode(code)
    }
  }

  if (error instanceof Error) {
    const code = error.message || 'SYNC_RUNTIME_ERROR'
    return {
      code,
      message: error.message || 'Sync runtime error',
      blockedReason: resolveBlockedReasonFromCode(code)
    }
  }

  return {
    code: 'SYNC_RUNTIME_ERROR',
    message: 'Sync runtime error',
    blockedReason: ''
  }
}

async function canRunSync(): Promise<boolean> {
  const preference = getSyncPreferenceState()
  if (!preference.enabled) {
    setSyncStatus('paused')
    return false
  }
  const token = await resolveAuthToken()
  if (!token) {
    setSyncStatus('paused')
    return false
  }
  const deviceId = await resolveDeviceId()
  if (!deviceId) {
    return false
  }
  return true
}

function scheduleRetry(stage: 'pull' | 'push', failCount: number): void {
  if (failCount <= 0) {
    return
  }
  const waitMs = RETRY_BACKOFF_MS[Math.min(failCount - 1, RETRY_BACKOFF_MS.length - 1)]
  setNextPullAt(new Date(Date.now() + waitMs).toISOString())
  clearRetryTimer()
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (!started) {
      return
    }
    if (stage === 'pull') {
      void performPull('polling')
      return
    }
    void performPush('debounce')
  }, waitMs)
}

function reportSyncError(stage: 'pull' | 'push', error: unknown): void {
  const info = resolveErrorInfo(error)
  const blockedReason = info.blockedReason
  const status: SyncRuntimeStatus = blockedReason ? 'paused' : 'error'
  const failures = markSyncError({
    code: info.code,
    message: info.message,
    blockedReason,
    status
  })

  scheduleRetry(stage, failures)
}

type AutoPullReason = 'startup' | 'login' | 'online' | 'polling' | 'manual' | 'after-conflict'

type AutoPushReason = 'debounce' | 'startup' | 'manual' | 'blob-batch'

async function performPull(reason: AutoPullReason): Promise<boolean> {
  if (!started) {
    return false
  }

  if (pullPromise) {
    return pullPromise
  }

  pullPromise = (async () => {
    if (!(await canRunSync())) {
      return false
    }
    registerStorageWatchers()
    const client = resolveSdk()
    setSyncStatus('syncing')
    clearRetryTimer()

    const timeoutMs = reason === 'startup' ? STARTUP_PULL_TIMEOUT_MS : NORMAL_PULL_TIMEOUT_MS
    const preference = getSyncPreferenceState()
    let cursor = Math.max(0, Math.floor(preference.cursor || 0))
    let page = 0

    try {
      while (page < 5) {
        page += 1
        const response = await withTimeout(
          client.pull({ cursor, limit: 200 }),
          timeoutMs,
          'PULL_TIMEOUT'
        )
        await applyPulledStorageItems(response.items, client)
        mergeKnownPluginQualifiedNamesFromPull(response.items)
        cursor = response.next_cursor

        if (response.oplog.length < 200) {
          break
        }
      }

      setSyncCursor(cursor)
      markSyncPullSuccess()
      clearSyncError()
      setSyncStatus('idle')
      setNextPullAt(new Date(Date.now() + AUTO_PULL_INTERVAL_MINUTES * 60 * 1000).toISOString())
      return true
    } catch (error) {
      reportSyncError('pull', error)
      return false
    } finally {
      pullPromise = null
    }
  })()

  return pullPromise
}

async function performPush(reason: AutoPushReason, forceAll = false): Promise<boolean> {
  if (!started) {
    return false
  }

  if (pushPromise) {
    return pushPromise
  }

  pushPromise = (async () => {
    if (!(await canRunSync())) {
      return false
    }

    registerStorageWatchers()
    const client = resolveSdk()
    setSyncStatus('syncing')
    clearRetryTimer()

    const scope = new Set<string>()
    if (forceAll) {
      for (const key of SYNC_STORAGE_KEYS) {
        scope.add(key)
      }
      for (const key of pendingBlobStorages) {
        scope.add(key)
      }
      scope.add(PLUGIN_SYNC_ALL_SCOPE)
    } else {
      for (const key of dirtyStorages) {
        scope.add(key)
      }
    }

    if (!scope.size) {
      setSyncStatus('idle')
      setQueueDepthByBuffers()
      pushPromise = null
      return false
    }

    const scopeMarkers = Array.from(scope).filter(isPluginScopeMarker)

    try {
      const snapshots = await collectStorageSnapshots(scope)
      const items: SyncItemInput[] = []
      const processed = new Set<string>()
      const currentPluginQualifiedNames = new Set<string>()

      for (const snapshot of snapshots) {
        if (isPluginStorageQualifiedName(snapshot.qualifiedName)) {
          currentPluginQualifiedNames.add(snapshot.qualifiedName)
        }

        const isLarge = snapshot.payloadSize > LARGE_PAYLOAD_THRESHOLD_BYTES
        if (isLarge && !forceAll && reason !== 'blob-batch') {
          pendingBlobStorages.add(snapshot.qualifiedName)
          dirtyStorages.delete(snapshot.qualifiedName)
          continue
        }

        const nowIso = new Date().toISOString()
        const opSeq = nextSyncOpSeq()
        if (isLarge) {
          const blob = new Blob([snapshot.payloadEnc], { type: 'text/plain;charset=utf-8' })
          const upload = await client.uploadBlob(blob, {
            filename: `${snapshot.qualifiedName}.sync`,
            contentType: 'text/plain;charset=utf-8'
          })
          items.push(buildBlobSyncItem(snapshot, opSeq, nowIso, upload.blob_id))
          pendingBlobStorages.delete(snapshot.qualifiedName)
        } else {
          items.push(buildSyncItemFromSnapshot(snapshot, opSeq, nowIso))
        }
        processed.add(snapshot.qualifiedName)
      }

      const deletedPluginQualifiedNames = resolvePluginDeleteCandidates(
        scope,
        currentPluginQualifiedNames
      )
      for (const qualifiedName of deletedPluginQualifiedNames) {
        const nowIso = new Date().toISOString()
        items.push(
          buildDeletedSyncItem(
            qualifiedName,
            nextSyncOpSeq(),
            nowIso,
            buildDeleteOpHash(qualifiedName, nowIso)
          )
        )
        processed.add(qualifiedName)
      }

      if (!items.length) {
        for (const marker of scopeMarkers) {
          dirtyStorages.delete(marker)
          pendingBlobStorages.delete(marker)
        }
        setSyncStatus('idle')
        scheduleBlobBatchPush()
        setQueueDepthByBuffers()
        return false
      }

      const result = await client.push(items)
      markSyncPushSuccess()
      clearSyncError()
      setSyncCursor(Math.max(getSyncPreferenceState().cursor, result.ack_cursor))
      setSyncStatus('idle')

      for (const key of processed) {
        dirtyStorages.delete(key)
        if (isSyncStorageKey(key)) {
          const data = getMainStorageConfig(key)
          if (data && typeof data === 'object') {
            lastSyncedSnapshots.set(key, cloneValue(data))
          }
        }
      }
      for (const marker of scopeMarkers) {
        dirtyStorages.delete(marker)
        pendingBlobStorages.delete(marker)
      }
      for (const qualifiedName of currentPluginQualifiedNames) {
        knownPluginQualifiedNames.add(qualifiedName)
      }
      for (const qualifiedName of deletedPluginQualifiedNames) {
        knownPluginQualifiedNames.delete(qualifiedName)
      }

      if (result.conflicts.length > 0) {
        markSyncConflict(result.conflicts.length)
        void performPull('after-conflict')
      }

      setQueueDepthByBuffers()
      scheduleBlobBatchPush()
      return true
    } catch (error) {
      reportSyncError('push', error)
      return false
    } finally {
      pushPromise = null
    }
  })()

  return pushPromise
}

async function runStartupSync(): Promise<void> {
  const pulled = await performPull('startup')
  if (!pulled) {
    return
  }
  await performPush('startup', true)
}

async function triggerManualSync(reason: 'user' | 'focus' | 'online'): Promise<void> {
  if (!started) {
    await startAutoSync()
  }
  if (!started) {
    return
  }

  await performPull(reason === 'online' ? 'online' : 'manual')
  await performPush('manual', true)
}

async function startAutoSync(): Promise<void> {
  if (started) {
    registerStorageWatchers()
    registerPluginStorageListener()
    return
  }
  if (!(await canRunSync())) {
    return
  }

  warmupKnownStorages()
  started = true
  clearPushTimers()
  clearRetryTimer()
  registerStorageWatchers()
  registerPluginStorageListener()

  setSyncStatus('idle')
  setNextPullAt(new Date(Date.now() + AUTO_PULL_INTERVAL_MINUTES * 60 * 1000).toISOString())

  if (pollingService.isRegistered(AUTO_PULL_TASK_ID)) {
    pollingService.unregister(AUTO_PULL_TASK_ID)
  }
  pollingService.register(
    AUTO_PULL_TASK_ID,
    () => {
      if (!started) {
        return
      }
      void performPull('polling')
    },
    {
      interval: AUTO_PULL_INTERVAL_MINUTES,
      unit: 'minutes'
    }
  )
  pollingService.start()

  await runStartupSync()
}

function stopAutoSync(reason = 'stop'): void {
  if (!started && !storageWatchers.size && !pluginStorageListenerBound) {
    return
  }

  started = false
  clearPushTimers()
  clearRetryTimer()
  dirtyStorages.clear()
  pendingBlobStorages.clear()
  knownPluginQualifiedNames.clear()
  setQueueDepthByBuffers()
  cleanupStorageWatchers()
  cleanupPluginStorageListener()

  if (pollingService.isRegistered(AUTO_PULL_TASK_ID)) {
    pollingService.unregister(AUTO_PULL_TASK_ID)
  }

  if (reason === 'logout' || reason === 'user-disabled') {
    setSyncStatus('paused')
    setNextPullAt('')
  }
}

function handleSyncEnabledChange(next: AppSetting): void {
  const enabled = Boolean(next?.sync?.enabled)
  if (enabled && !started) {
    void startAutoSync()
    return
  }
  if (!enabled && started) {
    stopAutoSync('user-disabled')
  }
}

export class SyncModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('SyncModule')
  name: ModuleKey = SyncModule.key
  private transportDisposers: Array<() => void> = []

  constructor() {
    super(SyncModule.key)
  }

  onInit({ app }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const channel =
      (app as { channel?: unknown } | null | undefined)?.channel ??
      ($app as { channel?: unknown } | null | undefined)?.channel
    if (!channel) {
      throw new Error('[SyncModule] TouchChannel not available on app context')
    }

    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    transport = getTuffTransportMain(channel, keyManager)

    requestRendererValue = async <T>(eventName: string): Promise<T | null> => {
      const sendMain = (
        channel as { sendMain?: (event: string, arg?: unknown) => Promise<unknown> }
      ).sendMain
      if (!sendMain) {
        syncLog.warn(`TouchChannel sendMain unavailable for ${eventName}`)
        return null
      }
      try {
        const response = await sendMain(eventName)
        if (response && typeof response === 'object' && 'data' in response) {
          return (response as { data?: T }).data ?? null
        }
        return (response as T) ?? null
      } catch (error) {
        syncLog.warn(`Failed to resolve ${eventName}`, { error })
        return null
      }
    }

    if (transport) {
      this.transportDisposers.push(
        transport.on(syncStartEvent, async () => {
          await startAutoSync()
          return { success: true }
        })
      )
      this.transportDisposers.push(
        transport.on(syncStopEvent, (payload) => {
          const reason = payload?.reason ? String(payload.reason) : 'stop'
          stopAutoSync(reason)
          return { success: true }
        })
      )
      this.transportDisposers.push(
        transport.on(syncTriggerEvent, async (payload) => {
          const reason =
            payload?.reason === 'online' || payload?.reason === 'focus' ? payload.reason : 'user'
          await triggerManualSync(reason)
          return { success: true }
        })
      )
      this.transportDisposers.push(
        transport.on(authTokenUpdatedEvent, async (payload) => {
          const status = payload?.status === 'cleared' ? 'cleared' : 'set'
          if (status === 'cleared') {
            stopAutoSync('logout')
            return
          }
          if (getSyncPreferenceState().enabled) {
            await startAutoSync()
          }
        })
      )
    }

    if (!syncEnabledWatcherCleanup) {
      syncEnabledWatcherCleanup = subscribeMainConfig(StorageList.APP_SETTING, (data) => {
        handleSyncEnabledChange(data as AppSetting)
      })
    }
  }

  onDestroy(): MaybePromise<void> {
    stopAutoSync('shutdown')
    if (syncEnabledWatcherCleanup) {
      syncEnabledWatcherCleanup()
      syncEnabledWatcherCleanup = null
    }
    cleanupPluginStorageListener()
    cleanupStorageWatchers()
    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore
      }
    }
    this.transportDisposers = []
    transport = null
    requestRendererValue = null
    sdk = null
  }
}

export const syncModule = new SyncModule()
