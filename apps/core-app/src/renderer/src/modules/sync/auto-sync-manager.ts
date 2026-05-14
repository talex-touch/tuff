import { hasWindow } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { SyncEvents } from '@talex-touch/utils/transport/events'
import { createRendererLogger } from '~/utils/renderer-log'

let onlineListenerBound = false
let onlineHandler: (() => void) | null = null

const syncLog = createRendererLogger('Sync')

export async function triggerManualSync(reason: 'user' | 'focus' | 'online'): Promise<void> {
  const transport = useTuffTransport()
  try {
    await transport.send(SyncEvents.lifecycle.trigger, { reason })
  } catch (error) {
    syncLog.warn('Failed to dispatch manual sync', error)
  }
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
      void triggerManualSync('online')
    }
    window.addEventListener('online', onlineHandler)
    onlineListenerBound = true
  }
}

export function stopAutoSync(reason = 'stop'): void {
  const transport = useTuffTransport()
  transport.send(SyncEvents.lifecycle.stop, { reason }).catch((error) => {
    syncLog.warn('Failed to dispatch stop', error)
  })

  if (onlineListenerBound && onlineHandler && hasWindow()) {
    window.removeEventListener('online', onlineHandler)
    onlineListenerBound = false
    onlineHandler = null
  }
}
