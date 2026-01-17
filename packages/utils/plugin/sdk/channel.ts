import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import type { IPluginRendererChannel, PluginChannelHandler } from './types'
import { hasWindow } from '@talex-touch/utils/env'
import { genChannel } from '../channel'

const ensureClientChannel = (): ITouchClientChannel => genChannel()

const DEFAULT_CHANNEL_ERROR = '[Plugin SDK] Channel not available. Make sure this code runs inside a plugin renderer context.'

let cachedWindowChannel: ITouchClientChannel | null = null

/**
 * Ensures that the renderer-side plugin channel (window.$channel) exists and returns it.
 *
 * @param errorMessage - Optional custom error message when the channel is unavailable
 */
export function ensureRendererChannel(errorMessage = DEFAULT_CHANNEL_ERROR): ITouchClientChannel {
  const globalWindow = hasWindow() ? window : undefined
  const channel = globalWindow?.$channel ?? cachedWindowChannel

  if (!channel) {
    throw new Error(errorMessage)
  }

  cachedWindowChannel = channel
  return channel
}

/**
 * Convenience hook for accessing window.$channel in plugin renderers.
 */
export function useChannel(errorMessage?: string): ITouchClientChannel {
  return ensureRendererChannel(errorMessage)
}

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

declare global {
  interface Window {
    $channel: ITouchClientChannel
  }
}
