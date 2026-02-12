import type { SyncItemInput } from '@talex-touch/utils'
import { CloudSyncError, CloudSyncSDK } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { hasWindow } from '@talex-touch/utils/env'
import { storages } from '@talex-touch/utils/renderer'
import { toast } from 'vue-sonner'
import { getSyncPreferenceState } from '~/modules/auth/sync-preferences'
import { getAppAuthToken, getAppDeviceId, getAuthBaseUrl } from '~/modules/auth/auth-env'
import {
  applyPulledStorageItems,
  buildBlobSyncItem,
  buildSyncItemFromSnapshot,
  collectStorageSnapshots,
  isLargeSnapshot
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
  for (const [qualifiedName, storage] of storages.entries()) {
    if (watcherMap.has(qualifiedName)) {
      continue
    }

    const callback = () => {
      if (!started || !getSyncPreferenceState().enabled) {
        return
      }
      dirtyStorages.add(qualifiedName)
      setQueueDepthByBuffers()
      scheduleDebouncedPush()
    }

    storage.onUpdate(callback)
    watcherMap.set(qualifiedName, () => {
      storage.offUpdate(callback)
    })
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

    try {
      const snapshots = await collectStorageSnapshots(scope)
      const items: SyncItemInput[] = []
      const processed = new Set<string>()

      for (const snapshot of snapshots) {
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

      if (!items.length) {
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
    return
  }
  if (!canRunSync()) {
    return
  }

  started = true
  clearPushTimers()
  clearRetryTimer()
  registerStorageWatchers()
  ensureOnlineListener()
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
  if (!started && !watcherMap.size) {
    return
  }

  started = false
  clearPushTimers()
  clearRetryTimer()
  dirtyStorages.clear()
  pendingBlobStorages.clear()
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

  if (reason === 'logout' || reason === 'user-disabled') {
    setSyncStatus('paused')
    setNextPullAt('')
  }
}
