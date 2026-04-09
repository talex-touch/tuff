import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { getRegisteredMainRuntime } from '../core/runtime-accessor'

type DropPayload = { plugin?: string; pluginName?: string } & Record<string, unknown>
const dropEvent = defineRawEvent<DropPayload, void>('drop')

export default {
  name: Symbol('DropManager'),
  filePath: false,
  listeners: new Array<() => void>(),
  init() {
    const channel = getRegisteredMainRuntime('core-box').channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)

    this.listeners.push(
      transport.on(dropEvent, async (payload) => {
        const pluginName = payload?.plugin ?? payload?.pluginName
        if (!pluginName) {
          return
        }
        await transport.sendToPlugin(pluginName, dropEvent, payload)
      })
    )
  },
  destroy() {
    this.listeners.forEach((listener) => listener())
  }
}
