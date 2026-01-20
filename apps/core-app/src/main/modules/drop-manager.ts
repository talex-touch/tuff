import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { genTouchApp } from '../core'

const dropEvent = defineRawEvent<any, void>('drop')

export default {
  name: Symbol('DropManager'),
  filePath: false,
  listeners: new Array<() => void>(),
  init() {
    const channel = genTouchApp().channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel as any, keyManager as any)

    this.listeners.push(
      transport.on(dropEvent, async (payload) => {
        const pluginName = (payload as any)?.plugin || (payload as any)?.pluginName
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
