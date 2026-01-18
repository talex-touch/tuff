import type { ITuffTransport } from '@talex-touch/utils/transport'
import type { CoreBoxInputChangeRequest } from '@talex-touch/utils/transport/events/types'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { createCoreBoxTransport } from './core-box-transport'

type CoreBoxInputMessage = CoreBoxInputChangeRequest

export function createCoreBoxInputTransport(
  transport: ITuffTransport,
  debounceMs = 35
): {
  broadcast: (payload: CoreBoxInputMessage) => void
} {
  const inputTransport = createCoreBoxTransport<CoreBoxInputMessage>(transport, {
    event: CoreBoxEvents.input.change,
    debounceMs
  })

  return {
    broadcast(payload: CoreBoxInputMessage) {
      inputTransport.dispatch(payload)
    }
  }
}
