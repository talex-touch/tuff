import type { ITuffTransport } from '@talex-touch/utils/transport'
import type { PluginChannelClient, PluginStandardChannelData } from './channel-client'
import type { IPluginRendererChannel, PluginChannelHandler } from './types'
import { hasWindow } from '@talex-touch/utils/env'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { genChannel } from '../channel'

const PLUGIN_CHANNEL_TYPE = 'plugin' as const
const DATA_CODE_SUCCESS = 200
type RendererWindowLike = Window & {
  $transport?: ITuffTransport
  $channel?: PluginChannelClient
}
const LEGACY_SEND_SYNC_REMOVE_VERSION = '2.5.0'
let hasWarnedLegacySendSyncFallback = false

function warnLegacySendSyncFallback(eventName: string): void {
  if (hasWarnedLegacySendSyncFallback) {
    return
  }
  hasWarnedLegacySendSyncFallback = true
  console.warn(
    `[Plugin SDK] sendSync fallback uses legacy channel and will be removed in v${LEGACY_SEND_SYNC_REMOVE_VERSION}. event=${eventName}`,
  )
}

const ensureClientChannel = (): PluginChannelClient =>
  genChannel() as unknown as PluginChannelClient
function resolvePluginName(): string | undefined {
  if (!hasWindow()) {
    return undefined
  }

  return (window as { $plugin?: { name?: string } } | undefined)?.$plugin?.name
}
function buildStandardChannelEvent(
  eventName: string,
  payload: unknown,
  pluginName: string | undefined,
  reply: (code: number, data: unknown) => void
): PluginStandardChannelData {
  return {
    name: eventName,
    header: {
      status: 'request',
      type: PLUGIN_CHANNEL_TYPE,
      plugin: pluginName,
    },
    code: DATA_CODE_SUCCESS,
    data: payload,
    plugin: pluginName,
    reply,
  }
}
function createTransportClientChannel(
  transport: ITuffTransport,
  fallback: PluginChannelClient | null
): PluginChannelClient {
  const handlerMap = new Map<string, Map<(data: PluginStandardChannelData) => any, () => void>>()

  return {
    regChannel: (eventName, callback) => {
      const disposer = transport.on(defineRawEvent(eventName), async (payload) => {
        let replied = false
        let replyData: unknown
        const event = buildStandardChannelEvent(
          eventName,
          payload,
          resolvePluginName(),
          (_code, data) => {
            replied = true
            replyData = data
          },
        )

        const result = await callback(event)
        return replied ? replyData : result
      })

      let handlers = handlerMap.get(eventName)
      if (!handlers) {
        handlers = new Map()
        handlerMap.set(eventName, handlers)
      }
      handlers.set(callback, disposer)

      return () => {
        disposer()
        handlers?.delete(callback)
      }
    },
    unRegChannel: (eventName, callback) => {
      const disposer = handlerMap.get(eventName)?.get(callback)
      if (!disposer) {
        return false
      }
      disposer()
      handlerMap.get(eventName)?.delete(callback)
      return true
    },
    send: (eventName, arg) => transport.send(defineRawEvent(eventName), arg),
    sendSync: (eventName, arg) => {
      if (fallback?.sendSync) {
        warnLegacySendSyncFallback(eventName)
        return fallback.sendSync(eventName, arg)
      }
      throw new Error(`[Plugin SDK] sendSync is not supported without legacy channel: ${eventName}`)
    },
  }
}
function resolveRendererTransport(): ITuffTransport | null {
  const globalWindow = hasWindow() ? (window as RendererWindowLike) : undefined
  return globalWindow?.$transport ?? null
}

const DEFAULT_CHANNEL_ERROR = '[Plugin SDK] Channel not available. Make sure this code runs inside a plugin renderer context.'

let cachedWindowChannel: PluginChannelClient | null = null
let cachedTransportChannel: PluginChannelClient | null = null

/**
 * Ensures that the renderer-side plugin channel (window.$channel) exists and returns it.
 *
 * @param errorMessage - Optional custom error message when the channel is unavailable
 */
export function ensureRendererChannel(errorMessage = DEFAULT_CHANNEL_ERROR): PluginChannelClient {
  const globalWindow = hasWindow() ? (window as RendererWindowLike) : undefined
  const transport = globalWindow?.$transport ?? null
  if (transport) {
    if (!cachedTransportChannel) {
      const fallback =
        (globalWindow?.$channel as PluginChannelClient | undefined) ?? cachedWindowChannel ?? null
      cachedTransportChannel = createTransportClientChannel(transport, fallback)
    }
    return cachedTransportChannel
  }

  const channel = (globalWindow?.$channel as PluginChannelClient | undefined) ?? cachedWindowChannel

  if (!channel) {
    throw new Error(errorMessage)
  }

  cachedWindowChannel = channel
  return channel
}

/**
 * Convenience hook for accessing window.$channel in plugin renderers.
 */
export function useChannel(errorMessage?: string): PluginChannelClient {
  return ensureRendererChannel(errorMessage)
}

export function createPluginRendererChannel(): IPluginRendererChannel {
  const client = ensureClientChannel()
  const transport = resolveRendererTransport()

  return {
    send(eventName, payload) {
      if (transport) {
        return transport.send(defineRawEvent(eventName), payload)
      }
      return client.send(eventName, payload)
    },

    sendSync(eventName, payload) {
      warnLegacySendSyncFallback(eventName)
      return client.sendSync(eventName, payload)
    },

    on(eventName, handler) {
      if (!transport) {
        return client.regChannel(eventName, handler)
      }

      return transport.on(defineRawEvent(eventName), async (payload) => {
        let replied = false
        let replyData: unknown
        const event = buildStandardChannelEvent(
          eventName,
          payload,
          resolvePluginName(),
          (_code, data) => {
            replied = true
            replyData = data
          },
        )

        const result = await handler(event)
        return replied ? replyData : result
      })
    },

    once(eventName, handler) {
      let dispose: () => void = () => void 0
      const wrapped: PluginChannelHandler = (event) => {
        dispose()
        handler(event)
      }

      dispose = this.on(eventName, wrapped)
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
