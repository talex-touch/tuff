import type { SyncItemInput, SyncItemOutput } from '@talex-touch/utils'
import { CloudSyncError, CloudSyncSDK } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { hasWindow } from '@talex-touch/utils/env'
import { storages } from '@talex-touch/utils/renderer'
import {
  appSettings,
  intelligenceStorage,
  openersStorage
} from '@talex-touch/utils/renderer/storage'
import { toast } from 'vue-sonner'
import { getSyncPreferenceState } from '~/modules/auth/sync-preferences'
import { getAppAuthToken, getAppDeviceId, getAuthBaseUrl } from '~/modules/auth/auth-env'
import { divisionBoxStorage } from '~/modules/storage/division-box-storage'
import { marketSourcesStorage } from '~/modules/storage/market-sources'
import { promptLibraryStorage } from '~/modules/storage/prompt-library'
import {
  PLUGIN_SYNC_ALL_SCOPE,
  buildPluginStorageQualifiedName,
  applyPulledStorageItems,
  buildDeletedSyncItem,
  buildBlobSyncItem,
  buildSyncItemFromSnapshot,
  collectStorageSnapshots,
  isLargeSnapshot,
  isPluginStorageQualifiedName,
  parsePluginStorageQualifiedName
} from './sync-item-mapper'
import {
  clearSyncError,
  markSyncConflict,
  markSyncError,
  markSyncPullSuccess,
  markSyncPushSuccess,
  nextSyncOpSeq,
  setNextPullAt,
  setSyncCursor,
  setSyncQueueDepth,
  setSyncStatus
} from './sync-status'

type SyncBlockedReason = '' | 'quota' | 'device' | 'auth'
type AutoPullReason = 'startup' | 'login' | 'online' | 'polling' | 'manual' | 'after-conflict'
type AutoPushReason =
  | 'debounce'
  | 'startup'
  | 'manual'
  | 'beforeunload'
  | 'blob-batch'
  | 'after-pull'

const AUTO_PULL_TASK_ID = 'renderer.sync.auto-pull'
const AUTO_PULL_INTERVAL_MINUTES = 10
const PUSH_DEBOUNCE_MS = 10_000
const LARGE_BLOB_BATCH_MS = 60_000
const LARGE_PAYLOAD_THRESHOLD_BYTES = 64 * 1024
const STARTUP_PULL_TIMEOUT_MS = 8_000
const NORMAL_PULL_TIMEOUT_MS = 20_000
const BEFORE_UNLOAD_FLUSH_TIMEOUT_MS = 3_000
const RETRY_BACKOFF_MS = [5_000, 30_000, 120_000, 300_000, 600_000] as const
const FAILURE_TOAST_THRESHOLD = 3

const pollingService = PollingService.getInstance()
const dirtyStorages = new Set<string>()
const pendingBlobStorages = new Set<string>()
const knownPluginQualifiedNames = new Set<string>()
const watcherMap = new Map<string, () => void>()

let started = false
let sdk: CloudSyncSDK | null = null
let pullPromise: Promise<boolean> | null = null
let pushPromise: Promise<boolean> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let blobBatchTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let onlineListenerBound = false
let beforeUnloadListenerBound = false
let onlineHandler: (() => void) | null = null
let pluginStorageListener: ((payload: { name?: unknown; fileName?: unknown }) => void) | null = null
let pluginStorageListenerBound = false

function warmupKnownStoragesForSync(): void {
  const candidates = [
    appSettings,
    openersStorage,
    intelligenceStorage,
    marketSourcesStorage,
    promptLibraryStorage,
    divisionBoxStorage
  ]

  for (const storage of candidates) {
    try {
      storage.get()
    } catch {
      // ignore storage warmup failures; sync runtime will still continue
    }
  }
}

function resolveSdk(): CloudSyncSDK {
  if (sdk) {
    return sdk
  }

  sdk = new CloudSyncSDK({
    baseUrl: getAuthBaseUrl(),
    getAuthToken: () => {
      const token = getAppAuthToken()
      if (!token) {
        throw new Error('AUTH_MISSING')
      }
      return token
    },
    getDeviceId: () => {
      const deviceId = getAppDeviceId()
      if (!deviceId) {
        throw new Error('DEVICE_ID_MISSING')
      }
      return deviceId
    }
  })

  return sdk
}

function setQueueDepthByBuffers(): void {
  const total = dirtyStorages.size + pendingBlobStorages.size
  setSyncQueueDepth(total)
}

function markStorageDirty(qualifiedName: string): void {
  const normalized = qualifiedName.trim()
  if (!normalized) {
    return
  }
  dirtyStorages.add(normalized)
  setQueueDepthByBuffers()
  scheduleDebouncedPush()
}

function isPluginScopeMarker(qualifiedName: string): boolean {
  const normalized = qualifiedName.trim()
  return (
    normalized === PLUGIN_SYNC_ALL_SCOPE ||
    (isPluginStorageQualifiedName(normalized) && normalized.endsWith('::'))
  )
}

function isPluginQualifiedStorage(qualifiedName: string): boolean {
  const normalized = qualifiedName.trim()
  return isPluginStorageQualifiedName(normalized) && normalized !== PLUGIN_SYNC_ALL_SCOPE
}

function buildDeleteOpHash(qualifiedName: string, updatedAt: string): string {
  return `delete:${qualifiedName}:${updatedAt}`
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
    if (!item.item_id.startsWith('storage::')) {
      continue
    }

    const fromMeta =
      item.meta_plain &&
      typeof item.meta_plain === 'object' &&
      typeof (item.meta_plain as { qualified_name?: unknown }).qualified_name === 'string'
        ? String((item.meta_plain as { qualified_name: string }).qualified_name).trim()
        : ''
    const qualifiedName = fromMeta || item.item_id.slice('storage::'.length).trim()
    if (!isPluginQualifiedStorage(qualifiedName)) {
      continue
    }

    if (item.deleted_at) {
      knownPluginQualifiedNames.delete(qualifiedName)
      continue
    }
    knownPluginQualifiedNames.add(qualifiedName)
  }
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

function canRunSync(): boolean {
  const preference = getSyncPreferenceState()
  if (!preference.enabled) {
    setSyncStatus('paused')
    return false
  }
  if (!getAppAuthToken()) {
    setSyncStatus('paused')
    return false
  }
  if (!getAppDeviceId()) {
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
  const status = blockedReason ? 'paused' : 'error'
  const failures = markSyncError({
    code: info.code,
    message: info.message,
    blockedReason,
    status
  })

  if (failures >= FAILURE_TOAST_THRESHOLD) {
    toast.error(`${stage === 'pull' ? '拉取' : '推送'}同步失败：${info.message}`)
  }

  if (blockedReason === 'quota') {
    toast.error('同步空间已达上限，请清理数据或升级套餐。')
    return
  }

  if (blockedReason === 'device') {
    toast.error('当前设备未授权，请在设备管理中完成授权后重试。')
    return
  }

  scheduleRetry(stage, failures)
}

function ensureOnlineListener(): void {
  if (onlineListenerBound || !hasWindow()) {
    return
  }
  onlineHandler = () => {
    void triggerManualSync('online')
  }
  window.addEventListener('online', onlineHandler)
  onlineListenerBound = true
}

function ensurePluginStorageListener(): void {
  if (pluginStorageListenerBound || !hasWindow() || !window.$channel) {
    return
  }

  pluginStorageListener = (payload) => {
    if (!started || !getSyncPreferenceState().enabled) {
      return
    }

    const pluginName = typeof payload?.name === 'string' ? payload.name.trim() : ''
    if (!pluginName) {
      markStorageDirty(PLUGIN_SYNC_ALL_SCOPE)
      return
    }

    const fileName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : ''
    const qualifiedName = buildPluginStorageQualifiedName(pluginName, fileName)
    if (qualifiedName) {
      markStorageDirty(qualifiedName)
      return
    }

    markStorageDirty(PLUGIN_SYNC_ALL_SCOPE)
  }

  window.$channel.regChannel('plugin:storage:update', pluginStorageListener)
  pluginStorageListenerBound = true
}

function cleanupPluginStorageListener(): void {
  if (!pluginStorageListenerBound || !pluginStorageListener || !hasWindow() || !window.$channel) {
    pluginStorageListener = null
    pluginStorageListenerBound = false
    return
  }

  window.$channel.unRegChannel('plugin:storage:update', pluginStorageListener)
  pluginStorageListener = null
  pluginStorageListenerBound = false
}

async function flushBeforeUnload(): Promise<void> {
  if (!started) {
    return
  }
  await withTimeout(
    performPush('beforeunload', true),
    BEFORE_UNLOAD_FLUSH_TIMEOUT_MS,
    'PUSH_TIMEOUT'
  )
}

function ensureBeforeUnloadListener(): void {
  if (beforeUnloadListenerBound || !hasWindow()) {
    return
  }
  window.addEventListener('beforeunload', () => {
    void flushBeforeUnload()
  })
  beforeUnloadListenerBound = true
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

export function registerStorageWatchers(): () => void {
  const newlyRegistered: string[] = []

  for (const [qualifiedName, storage] of storages.entries()) {
    if (watcherMap.has(qualifiedName)) {
      continue
    }

    const callback = () => {
      if (!started || !getSyncPreferenceState().enabled) {
        return
      }
      markStorageDirty(qualifiedName)
    }

    storage.onUpdate(callback)
    watcherMap.set(qualifiedName, () => {
      storage.offUpdate(callback)
    })
    newlyRegistered.push(qualifiedName)
  }

  if (started && newlyRegistered.length > 0) {
    for (const qualifiedName of newlyRegistered) {
      dirtyStorages.add(qualifiedName)
    }
    setQueueDepthByBuffers()
    scheduleDebouncedPush()
  }

  return () => {
    for (const dispose of watcherMap.values()) {
      dispose()
    }
    watcherMap.clear()
  }
}

function cleanupStorageWatchers(): void {
  for (const dispose of watcherMap.values()) {
    dispose()
  }
  watcherMap.clear()
}

async function performPull(reason: AutoPullReason): Promise<boolean> {
  if (!started) {
    return false
  }

  if (pullPromise) {
    return pullPromise
  }

  pullPromise = (async () => {
    if (!canRunSync()) {
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
    if (!canRunSync()) {
      return false
    }

    registerStorageWatchers()
    const client = resolveSdk()
    setSyncStatus('syncing')
    clearRetryTimer()

    const scope = new Set<string>()
    if (forceAll) {
      for (const key of storages.keys()) {
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
        if (isPluginQualifiedStorage(snapshot.qualifiedName)) {
          currentPluginQualifiedNames.add(snapshot.qualifiedName)
        }

        const isLarge = isLargeSnapshot(snapshot, LARGE_PAYLOAD_THRESHOLD_BYTES)
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

export async function triggerManualSync(reason: 'user' | 'focus' | 'online'): Promise<void> {
  if (!started) {
    await startAutoSync()
  }
  if (!started) {
    return
  }

  await performPull(reason === 'online' ? 'online' : 'manual')
  await performPush('manual', true)
}

export async function startAutoSync(): Promise<void> {
  if (started) {
    registerStorageWatchers()
    ensurePluginStorageListener()
    return
  }
  if (!canRunSync()) {
    return
  }

  warmupKnownStoragesForSync()
  started = true
  clearPushTimers()
  clearRetryTimer()
  registerStorageWatchers()
  ensureOnlineListener()
  ensurePluginStorageListener()
  ensureBeforeUnloadListener()

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

export function stopAutoSync(reason = 'stop'): void {
  if (!started && !watcherMap.size && !pluginStorageListenerBound) {
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

  if (pollingService.isRegistered(AUTO_PULL_TASK_ID)) {
    pollingService.unregister(AUTO_PULL_TASK_ID)
  }

  if (onlineListenerBound && onlineHandler && hasWindow()) {
    window.removeEventListener('online', onlineHandler)
    onlineListenerBound = false
    onlineHandler = null
  }
  cleanupPluginStorageListener()

  if (reason === 'logout' || reason === 'user-disabled') {
    setSyncStatus('paused')
    setNextPullAt('')
  }
}
