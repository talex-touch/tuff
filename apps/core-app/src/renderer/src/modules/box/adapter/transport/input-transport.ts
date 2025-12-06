import type { ITouchClientChannel, TuffQuery } from '@talex-touch/utils'
import { createCoreBoxTransport } from './core-box-transport'

interface CoreBoxInputMessage {
  input?: string
  query?: TuffQuery
  source?: 'renderer'
}

export function createCoreBoxInputTransport(
  channel: ITouchClientChannel,
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
