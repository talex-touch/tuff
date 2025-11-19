import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import type { IPluginRendererChannel, PluginChannelHandler } from './types'
import { genChannel } from '../channel'

const ensureClientChannel = (): ITouchClientChannel => genChannel()

export function createPluginRendererChannel(): IPluginRendererChannel {
  const client = ensureClientChannel()

  return {
    send(eventName, payload) {
      return client.send(eventName, payload)
    },

    sendSync(eventName, payload) {
      return client.sendSync(eventName, payload)
    },

    on(eventName, handler) {
      return client.regChannel(eventName, handler)
    },

    once(eventName, handler) {
      let dispose: () => void = () => void 0
      const wrapped: PluginChannelHandler = (event) => {
        dispose()
        handler(event)
      }

      dispose = client.regChannel(eventName, wrapped)
      return dispose
    },

    get raw() {
      return client
    },
  }
}

let cachedRendererChannel: IPluginRendererChannel | null = null

export function usePluginRendererChannel(): IPluginRendererChannel {
  if (!cachedRendererChannel) {
    cachedRendererChannel = createPluginRendererChannel()
  }

  return cachedRendererChannel
}
