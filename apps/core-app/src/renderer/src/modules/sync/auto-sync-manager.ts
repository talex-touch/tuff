import { hasWindow } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

const syncStartEvent = defineRawEvent<{ reason?: string }, { success: boolean }>('sync:start')
const syncStopEvent = defineRawEvent<{ reason?: string }, { success: boolean }>('sync:stop')
const syncTriggerEvent = defineRawEvent<
  { reason?: 'user' | 'focus' | 'online' },
  { success: boolean }
>('sync:trigger')

let onlineListenerBound = false
let onlineHandler: (() => void) | null = null

export async function triggerManualSync(reason: 'user' | 'focus' | 'online'): Promise<void> {
  const transport = useTuffTransport()
  try {
    await transport.send(syncTriggerEvent, { reason })
  } catch (error) {
    console.warn('[Sync] Failed to dispatch manual sync', error)
  }
}

export async function startAutoSync(): Promise<void> {
  const transport = useTuffTransport()
  try {
    await transport.send(syncStartEvent, { reason: 'renderer' })
  } catch (error) {
    console.warn('[Sync] Failed to dispatch start', error)
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
  transport.send(syncStopEvent, { reason }).catch((error) => {
    console.warn('[Sync] Failed to dispatch stop', error)
  })

  if (onlineListenerBound && onlineHandler && hasWindow()) {
    window.removeEventListener('online', onlineHandler)
    onlineListenerBound = false
    onlineHandler = null
  }
}
