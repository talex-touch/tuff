import type { TuffQuery } from '@talex-touch/utils'
import { useDebounceFn } from '@vueuse/core'

interface CoreBoxInputMessage {
  input: string
  query: TuffQuery
  source?: 'renderer'
}

interface ChannelLike {
  send: (event: string, payload?: any) => Promise<any>
}

export function createCoreBoxInputTransport(
  channel: ChannelLike,
  debounceMs = 35,
): {
  broadcast: (payload: CoreBoxInputMessage) => void
} {
  const emitInputChange = useDebounceFn((payload: CoreBoxInputMessage) => {
    channel.send('core-box:input-change', payload).catch((error) => {
      console.error('[coreBoxInputTransport] Failed to broadcast input change:', error)
    })
  }, debounceMs)

  return {
    broadcast(payload: CoreBoxInputMessage) {
      emitInputChange(payload)
    },
  }
}
