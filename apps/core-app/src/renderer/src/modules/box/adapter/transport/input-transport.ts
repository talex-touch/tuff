import type { TuffQuery } from '@talex-touch/utils'
import { createCoreBoxTransport } from './core-box-transport'

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
  debounceMs = 35
): {
  broadcast: (payload: CoreBoxInputMessage) => void
} {
  const transport = createCoreBoxTransport<CoreBoxInputMessage>(channel, {
    event: 'core-box:input-change',
    debounceMs
  })

  return {
    broadcast(payload: CoreBoxInputMessage) {
      transport.dispatch(payload)
    }
  }
}
