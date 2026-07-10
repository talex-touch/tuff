import { RAW_PLUGIN_PROCESS_CHANNEL } from '../shared/ipc/raw-channel'

const DATA_CODE_SUCCESS = 200
const DATA_CODE_ERROR = 100
const DEFAULT_TIMEOUT_MS = 60_000
const MAX_EARLY_MESSAGES_PER_EVENT = 100

export interface PluginViewIpcAdapter {
  on: (channel: string, listener: (event: unknown, payload: unknown) => void) => void
  removeListener: (channel: string, listener: (event: unknown, payload: unknown) => void) => void
  send: (channel: string, payload: unknown) => void
}

interface RawChannelSync {
  timeStamp: number
  timeout: number
  id: string
}

interface RawPluginChannelMessage {
  name: string
  code: number
  data?: unknown
  plugin?: string
  sync?: RawChannelSync
  header: {
    status: 'request' | 'reply'
    type: 'plugin'
    uniqueKey: string
  }
}

export interface PluginViewChannelEvent {
  name: string
  code: number
  data?: unknown
  plugin?: string
  header: {
    status: 'request'
    type: 'plugin'
    plugin?: string
  }
  reply: (code: number, data: unknown) => void
}

export type PluginViewChannelHandler = (event: PluginViewChannelEvent) => unknown

export interface PluginViewChannelApi {
  regChannel: (eventName: string, callback: PluginViewChannelHandler) => () => void
  unRegChannel: (eventName: string, callback: PluginViewChannelHandler) => boolean
  send: (eventName: string, payload?: unknown) => Promise<unknown>
  destroy: () => void
}

export interface PluginViewChannelOptions {
  uniqueKey: string
  timeoutMs?: number
  createRequestId?: (eventName: string) => string
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseMessage(value: unknown, uniqueKey: string): RawPluginChannelMessage | null {
  if (!isRecord(value) || !isRecord(value.header)) return null
  if (value.header.uniqueKey !== uniqueKey) return null
  if (value.header.type !== 'plugin') return null
  if (value.header.status !== 'request' && value.header.status !== 'reply') return null
  if (typeof value.name !== 'string' || !value.name) return null
  if (typeof value.code !== 'number') return null

  let sync: RawChannelSync | undefined
  if (value.sync !== undefined) {
    if (!isRecord(value.sync) || typeof value.sync.id !== 'string') return null
    sync = {
      id: value.sync.id,
      timeout: typeof value.sync.timeout === 'number' ? value.sync.timeout : DEFAULT_TIMEOUT_MS,
      timeStamp: typeof value.sync.timeStamp === 'number' ? value.sync.timeStamp : Date.now()
    }
  }

  return {
    name: value.name,
    code: value.code,
    data: value.data,
    plugin: typeof value.plugin === 'string' ? value.plugin : undefined,
    sync,
    header: {
      status: value.header.status,
      type: 'plugin',
      uniqueKey
    }
  }
}

function createChannelError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

export function createPluginViewChannel(
  ipc: PluginViewIpcAdapter,
  options: PluginViewChannelOptions
): PluginViewChannelApi {
  const uniqueKey = options.uniqueKey.trim()
  if (!uniqueKey) {
    throw new Error('Plugin view channel unique key is required.')
  }

  const handlers = new Map<string, Set<PluginViewChannelHandler>>()
  const pending = new Map<string, PendingRequest>()
  const earlyMessages = new Map<string, RawPluginChannelMessage[]>()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let destroyed = false

  const sendReply = (message: RawPluginChannelMessage, code: number, data: unknown): void => {
    if (!message.sync || destroyed) return
    ipc.send(RAW_PLUGIN_PROCESS_CHANNEL, {
      name: message.name,
      code,
      data,
      plugin: message.plugin,
      sync: {
        id: message.sync.id,
        timeout: message.sync.timeout,
        timeStamp: Date.now()
      },
      header: {
        status: 'reply',
        type: 'plugin',
        uniqueKey
      }
    })
  }

  const dispatch = (message: RawPluginChannelMessage): void => {
    const eventHandlers = handlers.get(message.name)
    if (!eventHandlers?.size) {
      const queue = earlyMessages.get(message.name) ?? []
      if (queue.length < MAX_EARLY_MESSAGES_PER_EVENT) queue.push(message)
      earlyMessages.set(message.name, queue)
      return
    }

    let replied = false
    const reply = (code: number, data: unknown): void => {
      if (replied) return
      replied = true
      sendReply(message, code, data)
    }
    const event: PluginViewChannelEvent = {
      name: message.name,
      code: message.code,
      data: message.data,
      plugin: message.plugin,
      header: {
        status: 'request',
        type: 'plugin',
        plugin: message.plugin
      },
      reply
    }

    for (const handler of eventHandlers) {
      Promise.resolve()
        .then(() => handler(event))
        .then((result) => reply(DATA_CODE_SUCCESS, result))
        .catch(() => reply(DATA_CODE_ERROR, { message: 'Plugin view handler failed.' }))
    }
  }

  const onMessage = (_event: unknown, payload: unknown): void => {
    if (destroyed) return
    const message = parseMessage(payload, uniqueKey)
    if (!message) return

    if (message.header.status === 'reply' && message.sync) {
      const request = pending.get(message.sync.id)
      if (!request) return
      pending.delete(message.sync.id)
      clearTimeout(request.timeout)
      request.resolve(message.data)
      return
    }

    if (message.header.status === 'request') {
      dispatch(message)
    }
  }

  ipc.on(RAW_PLUGIN_PROCESS_CHANNEL, onMessage)

  const channel: PluginViewChannelApi = {
    regChannel(eventName, callback) {
      if (destroyed) {
        throw createChannelError('plugin_channel_destroyed', 'Plugin view channel is closed.')
      }
      const eventHandlers = handlers.get(eventName) ?? new Set()
      eventHandlers.add(callback)
      handlers.set(eventName, eventHandlers)

      const queued = earlyMessages.get(eventName)
      if (queued?.length) {
        earlyMessages.delete(eventName)
        queued.forEach(dispatch)
      }

      return () => {
        eventHandlers.delete(callback)
        if (!eventHandlers.size) handlers.delete(eventName)
      }
    },
    unRegChannel(eventName, callback) {
      const eventHandlers = handlers.get(eventName)
      if (!eventHandlers?.delete(callback)) return false
      if (!eventHandlers.size) handlers.delete(eventName)
      return true
    },
    send(eventName, payload) {
      if (destroyed) {
        return Promise.reject(
          createChannelError('plugin_channel_destroyed', 'Plugin view channel is closed.')
        )
      }

      const requestId =
        options.createRequestId?.(eventName) ??
        `${Date.now()}#${eventName}@${Math.random().toString(36).slice(2)}`
      const sync: RawChannelSync = {
        id: requestId,
        timeout: timeoutMs,
        timeStamp: Date.now()
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(requestId)
          reject(
            createChannelError(
              'plugin_channel_timeout',
              `Plugin channel request "${eventName}" timed out.`
            )
          )
        }, timeoutMs)
        pending.set(requestId, { resolve, reject, timeout })

        try {
          ipc.send(RAW_PLUGIN_PROCESS_CHANNEL, {
            name: eventName,
            code: DATA_CODE_SUCCESS,
            data: payload,
            sync,
            header: {
              status: 'request',
              type: 'plugin',
              uniqueKey
            }
          })
        } catch {
          clearTimeout(timeout)
          pending.delete(requestId)
          reject(
            createChannelError(
              'plugin_channel_send_failed',
              `Failed to send plugin channel request "${eventName}".`
            )
          )
        }
      })
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      ipc.removeListener(RAW_PLUGIN_PROCESS_CHANNEL, onMessage)
      handlers.clear()
      earlyMessages.clear()
      for (const request of pending.values()) {
        clearTimeout(request.timeout)
        request.reject(
          createChannelError('plugin_channel_destroyed', 'Plugin view channel is closed.')
        )
      }
      pending.clear()
    }
  }

  return channel
}
