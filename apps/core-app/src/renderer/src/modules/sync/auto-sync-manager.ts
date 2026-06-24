import { hasWindow } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { NetworkEvents, SyncEvents } from '@talex-touch/utils/transport/events'
import { createRendererLogger } from '~/utils/renderer-log'

let onlineListenerBound = false
let onlineHandler: (() => void) | null = null
let offlineHandler: (() => void) | null = null
let networkStatusDisposer: (() => void) | null = null
let lastOnlineSyncAt = 0

const ONLINE_SYNC_DEDUPE_MS = 1000

const syncLog = createRendererLogger('Sync')

export async function triggerManualSync(reason: 'user' | 'focus' | 'online'): Promise<void> {
  const transport = useTuffTransport()
  try {
    await transport.send(SyncEvents.lifecycle.trigger, { reason })
  } catch (error) {
    syncLog.warn('Failed to dispatch manual sync', error)
  }
}

function triggerOnlineRecovery(): void {
  const now = Date.now()
  if (now - lastOnlineSyncAt < ONLINE_SYNC_DEDUPE_MS) {
    return
  }
  lastOnlineSyncAt = now
  void triggerManualSync('online')
}

export async function startAutoSync(): Promise<void> {
  const transport = useTuffTransport()
  try {
    await transport.send(SyncEvents.lifecycle.start, { reason: 'renderer' })
  } catch (error) {
    syncLog.warn('Failed to dispatch start', error)
  }

  if (!onlineListenerBound && hasWindow()) {
    onlineHandler = () => {
      const transport = useTuffTransport()
      transport.send(NetworkEvents.lifecycle.online, { reason: 'online' }).catch((error) => {
        syncLog.warn('Failed to dispatch network online event', error)
      })
      triggerOnlineRecovery()
    }
    offlineHandler = () => {
      const transport = useTuffTransport()
      transport.send(NetworkEvents.lifecycle.offline, { reason: 'offline' }).catch((error) => {
        syncLog.warn('Failed to dispatch network offline event', error)
      })
    }
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)
    onlineListenerBound = true
  }

  if (!networkStatusDisposer) {
    networkStatusDisposer = transport.on(NetworkEvents.lifecycle.status, (status) => {
      if (status.online) {
        triggerOnlineRecovery()
      }
    })
  }
}

export function stopAutoSync(reason = 'stop'): void {
  const transport = useTuffTransport()
  transport.send(SyncEvents.lifecycle.stop, { reason }).catch((error) => {
    syncLog.warn('Failed to dispatch stop', error)
  })

  if (onlineListenerBound && onlineHandler && hasWindow()) {
    window.removeEventListener('online', onlineHandler)
    if (offlineHandler) {
      window.removeEventListener('offline', offlineHandler)
    }
    onlineListenerBound = false
    onlineHandler = null
    offlineHandler = null
  }

  networkStatusDisposer?.()
  networkStatusDisposer = null
}
