/**
 * @fileoverview Main process TuffTransport implementation
 * @module @talex-touch/utils/transport/sdk/main-transport
 */

import type { IpcMainInvokeEvent, MessagePortMain, WebContents } from 'electron'
import type { TuffEvent } from '../event/types'
import type { TransportPortConfirmPayload, TransportPortEnvelope, TransportPortScope, TransportPortUpgradeResponse } from '../events'
import type {
  HandlerContext,
  ITuffTransportMain,
  MainInvokeContext,
  PluginKeyManager,
  StreamContext,
} from '../types'
import { randomUUID } from 'node:crypto'
import * as electron from 'electron'
import { assertTuffEvent } from '../event/builder'
import { TransportEvents } from '../events'
import { STREAM_SUFFIXES } from './constants'
import { isPortChannelEnabled } from './port-policy'

const { ipcMain, MessageChannelMain } = electron
const LEGACY_CHANNEL = {
  MAIN: 'main',
  PLUGIN: 'plugin',
} as const
const LEGACY_SUCCESS_CODE = 200
type LegacyChannelType = (typeof LEGACY_CHANNEL)[keyof typeof LEGACY_CHANNEL]
type LegacyChannelCallback = (data: any) => unknown
type LegacyMainChannel = {
  regChannel: (type: LegacyChannelType, eventName: string, callback: LegacyChannelCallback) => () => void
  sendTo: (
    win: Electron.BrowserWindow,
    type: LegacyChannelType,
    eventName: string,
    arg: unknown,
  ) => Promise<any>
  sendPlugin: (pluginName: string, eventName: string, arg?: unknown) => Promise<any>
  broadcast: (type: LegacyChannelType, eventName: string, arg?: unknown) => void
  broadcastTo: (
    win: Electron.BrowserWindow,
    type: LegacyChannelType,
    eventName: string,
    arg?: unknown,
  ) => void
}

type InvokeHandler<TReq, TRes> = (
  payload: TReq,
  event: IpcMainInvokeEvent,
) => TRes | Promise<TRes>

const invokeHandlers = new Map<string, Set<InvokeHandler<any, any>>>()
type LocalHandler = (payload: unknown, context: HandlerContext) => unknown | Promise<unknown>
const localHandlers = new Map<string, Set<LocalHandler>>()

function registerInvokeHandler<TReq, TRes>(
  eventName: string,
  handler: InvokeHandler<TReq, TRes>,
): () => void {
  let handlers = invokeHandlers.get(eventName)
  if (!handlers) {
    handlers = new Set()
    invokeHandlers.set(eventName, handlers)

    ipcMain.handle(eventName, async (event, payload) => {
      const active = invokeHandlers.get(eventName)
      if (!active || active.size === 0) {
        return undefined
      }

      let result: unknown
      for (const fn of active) {
        result = await fn(payload as TReq, event)
      }
      return result as TRes
    })
  }

  handlers.add(handler)

  return () => {
    const current = invokeHandlers.get(eventName)
    if (!current) {
      return
    }
    current.delete(handler)
  }
}

function registerLocalHandler(eventName: string, handler: LocalHandler): () => void {
  let handlers = localHandlers.get(eventName)
  if (!handlers) {
    handlers = new Set()
    localHandlers.set(eventName, handlers)
  }
  handlers.add(handler)

  return () => {
    const current = localHandlers.get(eventName)
    if (!current) {
      return
    }
    current.delete(handler)
    if (current.size === 0) {
      localHandlers.delete(eventName)
    }
  }
}

function resolveDefaultSender(): WebContents | undefined {
  const focused = electron.BrowserWindow.getFocusedWindow()?.webContents
  if (focused && !focused.isDestroyed()) {
    return focused
  }

  for (const win of electron.BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      const wc = win.webContents
      if (wc && !wc.isDestroyed()) {
        return wc
      }
    }
  }

  return undefined
}

interface PortRecord {
  port: MessagePortMain
  sender: WebContents
  channel: string
  scope: TransportPortScope
  windowId?: number
  plugin?: string
  permissions?: string[]
  confirmed: boolean
  createdAt: number
  confirmTimeout?: NodeJS.Timeout
}

const PORT_CONFIRM_TIMEOUT_MS = 10000
const portRegistry = new Map<string, PortRecord>()
const portsBySenderId = new Map<number, Set<string>>()
const senderCleanupRegistered = new WeakSet<WebContents>()
let portHandlersRegistered = false

interface PortLookup {
  portId: string
  record: PortRecord
}

function resolvePortRecord(channel: string, sender: WebContents, scope?: TransportPortScope): PortLookup | null {
  const portIds = portsBySenderId.get(sender.id)
  if (!portIds)
    return null

  for (const portId of portIds) {
    const record = portRegistry.get(portId)
    if (!record || !record.confirmed)
      continue
    if (record.channel !== channel)
      continue
    if (scope && record.scope !== scope)
      continue
    if (record.scope === 'window' && record.windowId !== undefined && record.windowId !== sender.id) {
      continue
    }
    return { portId, record }
  }
  return null
}

function postPortMessage(lookup: PortLookup, message: TransportPortEnvelope): boolean {
  try {
    lookup.record.port.postMessage(message)
    return true
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.warn(`[TuffTransport] Port send failed for \"${message.channel}\": ${errorMessage}`)
    return false
  }
}

function registerPortHandlers(transport: TuffMainTransport): void {
  if (portHandlersRegistered) {
    return
  }
  portHandlersRegistered = true

  const buildError = (code: string, message: string) => ({ code, message })

  const removePort = (portId: string, reason?: string) => {
    const record = portRegistry.get(portId)
    if (!record)
      return

    if (record.confirmTimeout) {
      clearTimeout(record.confirmTimeout)
    }
    try {
      record.port.close()
    }
    catch {}

    portRegistry.delete(portId)
    const senderPorts = portsBySenderId.get(record.sender.id)
    if (senderPorts) {
      senderPorts.delete(portId)
      if (senderPorts.size === 0) {
        portsBySenderId.delete(record.sender.id)
      }
    }

    if (reason) {
      console.warn(`[TuffTransport] Port ${portId} closed: ${reason}`)
    }
  }

  const ensureSenderCleanup = (sender: WebContents) => {
    if (senderCleanupRegistered.has(sender))
      return
    senderCleanupRegistered.add(sender)
    sender.once('destroyed', () => {
      const portIds = portsBySenderId.get(sender.id)
      if (!portIds)
        return
      for (const portId of portIds) {
        removePort(portId, 'sender_destroyed')
      }
      portsBySenderId.delete(sender.id)
    })
  }

  const resolveScope = (scope?: TransportPortScope): TransportPortScope | null => {
    if (!scope)
      return 'window'
    if (scope === 'app' || scope === 'window' || scope === 'plugin')
      return scope
    return null
  }

  transport.on(TransportEvents.port.upgrade, async (payload, context) => {
    const sender = context.sender as WebContents | undefined
    if (!sender || typeof sender.postMessage !== 'function') {
      return {
        accepted: false,
        channel: payload?.channel ?? '',
        error: buildError('sender_unavailable', 'Sender webContents is unavailable'),
      } satisfies TransportPortUpgradeResponse
    }

    if (!MessageChannelMain) {
      return {
        accepted: false,
        channel: payload?.channel ?? '',
        error: buildError('not_supported', 'MessageChannelMain is not available'),
      } satisfies TransportPortUpgradeResponse
    }

    const channel = payload?.channel?.trim()
    if (!channel) {
      return {
        accepted: false,
        channel: '',
        error: buildError('invalid_request', 'Channel is required'),
      } satisfies TransportPortUpgradeResponse
    }

    const scope = resolveScope(payload?.scope)
    if (!scope) {
      return {
        accepted: false,
        channel,
        error: buildError('invalid_scope', 'Scope is invalid'),
      } satisfies TransportPortUpgradeResponse
    }

    const windowId = payload?.windowId ?? sender.id
    if (scope === 'window' && windowId !== sender.id) {
      return {
        accepted: false,
        channel,
        scope,
        error: buildError('window_mismatch', 'Window id does not match sender'),
      } satisfies TransportPortUpgradeResponse
    }

    const plugin = payload?.plugin ?? context.plugin?.name
    if (scope === 'plugin' && !plugin) {
      return {
        accepted: false,
        channel,
        scope,
        error: buildError('plugin_required', 'Plugin name is required for plugin scope'),
      } satisfies TransportPortUpgradeResponse
    }

    if (context.plugin?.name && plugin && plugin !== context.plugin.name) {
      return {
        accepted: false,
        channel,
        scope,
        error: buildError('plugin_mismatch', 'Plugin name does not match sender'),
      } satisfies TransportPortUpgradeResponse
    }

    const { port1, port2 } = new MessageChannelMain()
    const portId = randomUUID()
    const record: PortRecord = {
      port: port2,
      sender,
      channel,
      scope,
      windowId,
      plugin: plugin || undefined,
      permissions: payload?.permissions,
      confirmed: false,
      createdAt: Date.now(),
    }

    portRegistry.set(portId, record)
    const senderPorts = portsBySenderId.get(sender.id) ?? new Set<string>()
    senderPorts.add(portId)
    portsBySenderId.set(sender.id, senderPorts)
    ensureSenderCleanup(sender)

    port2.on('close', () => {
      removePort(portId, 'port_closed')
    })
    port2.start()

    const confirmPayload: TransportPortConfirmPayload = {
      channel,
      portId,
      scope,
      permissions: payload?.permissions,
    }

    try {
      sender.postMessage(TransportEvents.port.confirm.toEventName(), confirmPayload, [port1])
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      removePort(portId, `postMessage_failed:${message}`)
      return {
        accepted: false,
        channel,
        scope,
        error: buildError('post_message_failed', message),
      } satisfies TransportPortUpgradeResponse
    }

    record.confirmTimeout = setTimeout(() => {
      if (!record.confirmed) {
        removePort(portId, 'confirm_timeout')
      }
    }, PORT_CONFIRM_TIMEOUT_MS)

    return {
      accepted: true,
      channel,
      scope,
      permissions: payload?.permissions,
      portId,
    } satisfies TransportPortUpgradeResponse
  })

  transport.on(TransportEvents.port.confirm, (payload, context) => {
    const portId = payload?.portId
    if (!portId)
      return
    const record = portRegistry.get(portId)
    if (!record)
      return
    if (context.sender && record.sender.id !== (context.sender as WebContents).id) {
      return
    }
    record.confirmed = true
    if (record.confirmTimeout) {
      clearTimeout(record.confirmTimeout)
      record.confirmTimeout = undefined
    }
  })

  transport.on(TransportEvents.port.close, (payload, context) => {
    const sender = context.sender as WebContents | undefined
    const portId = payload?.portId
    if (portId) {
      if (!sender || portRegistry.get(portId)?.sender.id === sender.id) {
        removePort(portId, payload?.reason ?? 'closed')
      }
      return
    }

    if (!sender)
      return
    const portIds = portsBySenderId.get(sender.id)
    if (!portIds)
      return
    for (const id of portIds) {
      const record = portRegistry.get(id)
      if (!record)
        continue
      if (payload?.channel && record.channel !== payload.channel)
        continue
      removePort(id, payload?.reason ?? 'closed')
    }
  })

  transport.on(TransportEvents.port.error, (payload, context) => {
    const portId = payload?.portId
    if (payload?.error) {
      console.warn('[TuffTransport] Port error:', payload.error)
    }
    if (!portId)
      return
    const sender = context.sender as WebContents | undefined
    if (!sender || portRegistry.get(portId)?.sender.id === sender.id) {
      removePort(portId, 'error')
    }
  })
}

/**
 * Main process transport implementation.
 * Adapts the legacy TouchChannel to the new TuffTransportMain interface.
 */
export class TuffMainTransport implements ITuffTransportMain {
  constructor(
    private channel: LegacyMainChannel,
    public readonly keyManager: PluginKeyManager,
  ) {
    registerPortHandlers(this)
  }

  /**
   * Registers an event handler.
   */
  on<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    handler: (payload: TReq, context: HandlerContext) => TRes | Promise<TRes>,
  ): () => void {
    assertTuffEvent(event, 'TuffMainTransport.on')

    const eventName = event.toEventName()

    const baseHandler = async (payload: TReq, context: HandlerContext) => {
      try {
        return await handler(payload, context)
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[TuffTransport] Handler error for \"${eventName}\":`, errorMessage)
        throw error
      }
    }

    const localHandler: LocalHandler = (payload, context) =>
      baseHandler(payload as TReq, context)

    const channelHandler = async (data: any) => {
      const context: HandlerContext = {
        sender: data.header?.event?.sender as any,
        eventName,
        plugin: data.plugin
          ? {
              name: data.plugin,
              uniqueKey: data.header?.uniqueKey || '',
              verified: Boolean(data.header?.uniqueKey),
            }
          : undefined,
      }

      return baseHandler(data.data as TReq, context)
    }

    const invokeHandler: InvokeHandler<TReq, TRes> = (payload, event) => {
      const context: HandlerContext = {
        sender: event.sender as any,
        eventName,
      }
      return baseHandler(payload, context)
    }

    const unregisterMain = this.channel.regChannel(LEGACY_CHANNEL.MAIN, eventName, channelHandler)
    const unregisterPlugin = this.channel.regChannel(
      LEGACY_CHANNEL.PLUGIN,
      eventName,
      channelHandler,
    )
    const unregisterInvoke = registerInvokeHandler(eventName, invokeHandler)
    const unregisterLocal = registerLocalHandler(eventName, localHandler)

    return () => {
      unregisterMain()
      unregisterPlugin()
      unregisterInvoke()
      unregisterLocal()
    }
  }

  /**
   * Registers a stream handler.
   *
   * @remarks
   * Phase 1 implementation uses IPC events to simulate streaming.
   */
  onStream<TReq, TChunk>(
    event: TuffEvent<TReq, AsyncIterable<TChunk>>,
    handler: (payload: TReq, context: StreamContext<TChunk>) => void | Promise<void>,
  ): () => void {
    assertTuffEvent(event, 'TuffMainTransport.onStream')

    const eventName = event.toEventName()
    const portEnabled = isPortChannelEnabled(eventName)
    const startEventName = `${eventName}${STREAM_SUFFIXES.START}`
    const cancelEventName = `${eventName}${STREAM_SUFFIXES.CANCEL}`

    const streams = new Map<string, { cancelled: boolean }>()

    const startHandler = (data: any) => {
      const rawPayload = data?.data as { streamId?: string, [key: string]: any } | undefined
      const streamId = rawPayload?.streamId
      const sender = data?.header?.event?.sender as any

      if (!streamId || !sender) {
        throw new Error(`[TuffTransport] Invalid stream start for "${eventName}"`)
      }

      streams.set(streamId, { cancelled: false })

      const portLookup = portEnabled
        ? resolvePortRecord(eventName, sender as WebContents, 'window')
        : null

      const sendPortStreamMessage = (message: TransportPortEnvelope): boolean => {
        if (!portLookup)
          return false
        const record = portRegistry.get(portLookup.portId)
        if (!record || !record.confirmed)
          return false
        return postPortMessage({ portId: portLookup.portId, record }, message)
      }

      const sendToSender = (name: string, payload: any) => {
        try {
          sender.send('@main-process-message', {
            code: LEGACY_SUCCESS_CODE,
            data: payload,
            name,
            header: { status: 'request', type: LEGACY_CHANNEL.MAIN },
          })
        }
        catch {
          // Ignore send failures (renderer may have been destroyed)
        }
      }

      const cleanup = () => {
        streams.delete(streamId)
      }

      const streamContext: StreamContext<TChunk> = {
        emit: (chunk: TChunk) => {
          if (streams.get(streamId)?.cancelled)
            return
          const portSent = sendPortStreamMessage({
            channel: eventName,
            portId: portLookup?.portId,
            streamId,
            type: 'data',
            payload: { chunk },
          })
          if (!portSent) {
            sendToSender(`${eventName}${STREAM_SUFFIXES.DATA}:${streamId}`, { chunk })
          }
        },
        error: (err: Error) => {
          if (streams.get(streamId)?.cancelled)
            return
          const errorMessage = err instanceof Error ? err.message : String(err)
          const portSent = sendPortStreamMessage({
            channel: eventName,
            portId: portLookup?.portId,
            streamId,
            type: 'error',
            payload: { error: errorMessage },
            error: { code: 'stream_error', message: errorMessage },
          })
          if (!portSent) {
            sendToSender(`${eventName}${STREAM_SUFFIXES.ERROR}:${streamId}`, {
              error: errorMessage,
            })
          }
          cleanup()
        },
        end: () => {
          if (streams.get(streamId)?.cancelled)
            return
          const portSent = sendPortStreamMessage({
            channel: eventName,
            portId: portLookup?.portId,
            streamId,
            type: 'close',
          })
          if (!portSent) {
            sendToSender(`${eventName}${STREAM_SUFFIXES.END}:${streamId}`, {})
          }
          cleanup()
        },
        isCancelled: () => {
          return streams.get(streamId)?.cancelled === true
        },
        streamId,
        sender,
        eventName,
        plugin: data.plugin
          ? {
              name: data.plugin,
              uniqueKey: data.header?.uniqueKey || '',
              verified: Boolean(data.header?.uniqueKey),
            }
          : undefined,
      }

      const payload = rawPayload ? { ...rawPayload } : {}
      delete (payload as any).streamId
      const requestPayload = payload as unknown as TReq

      Promise.resolve(handler(requestPayload, streamContext)).catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[TuffTransport] Stream handler error for "${eventName}":`, errorMessage)
        streamContext.error(error as Error)
      })
    }

    const cancelHandler = (data: any) => {
      const rawPayload = data?.data as { streamId?: string } | undefined
      const streamId = rawPayload?.streamId
      if (!streamId)
        return
      const state = streams.get(streamId)
      if (state)
        state.cancelled = true
      streams.delete(streamId)
    }

    const startCleanupMain = this.channel.regChannel(
      LEGACY_CHANNEL.MAIN,
      startEventName,
      startHandler,
    )
    const cancelCleanupMain = this.channel.regChannel(
      LEGACY_CHANNEL.MAIN,
      cancelEventName,
      cancelHandler,
    )
    const startCleanupPlugin = this.channel.regChannel(
      LEGACY_CHANNEL.PLUGIN,
      startEventName,
      startHandler,
    )
    const cancelCleanupPlugin = this.channel.regChannel(
      LEGACY_CHANNEL.PLUGIN,
      cancelEventName,
      cancelHandler,
    )

    return () => {
      startCleanupMain()
      cancelCleanupMain()
      startCleanupPlugin()
      cancelCleanupPlugin()
    }
  }

  async invoke<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
    context: MainInvokeContext = {},
  ): Promise<TRes> {
    assertTuffEvent(event, 'TuffMainTransport.invoke')

    const eventName = event.toEventName()
    const handlers = localHandlers.get(eventName)
    if (!handlers || handlers.size === 0) {
      throw new Error(`[TuffTransport] No handler registered for "${eventName}"`)
    }

    const sender = context.sender ?? resolveDefaultSender()
    if (!sender) {
      throw new Error(`[TuffTransport] Cannot resolve sender for "${eventName}"`)
    }

    const handlerContext: HandlerContext = {
      sender,
      eventName,
      plugin: context.plugin,
    }

    let result: unknown
    for (const handler of handlers) {
      result = await handler(payload as unknown, handlerContext)
    }
    return result as TRes
  }

  /**
   * Sends a message to a specific window.
   */
  async sendToWindow<TReq, TRes>(
    windowId: number,
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
  ): Promise<TRes> {
    assertTuffEvent(event, 'TuffMainTransport.sendToWindow')

    const eventName = event.toEventName()
    const { BrowserWindow } = await import('electron')
    const win = BrowserWindow.fromId(windowId)
    if (!win) {
      throw new Error(`[TuffTransport] Cannot find BrowserWindow for id=${windowId}`)
    }
    if (isPortChannelEnabled(eventName)) {
      const portLookup = resolvePortRecord(eventName, win.webContents, 'window')
      if (portLookup) {
        const portSent = postPortMessage(portLookup, {
          channel: eventName,
          portId: portLookup.portId,
          type: 'data',
          payload,
        })
        if (portSent) {
          return undefined as TRes
        }
      }
    }
    return this.channel.sendTo(win, LEGACY_CHANNEL.MAIN, eventName, payload)
  }

  /**
   * Broadcasts a message to a specific window (fire-and-forget).
   */
  broadcastToWindow<TReq>(
    windowId: number,
    event: TuffEvent<TReq, void>,
    payload: TReq,
  ): void {
    assertTuffEvent(event, 'TuffMainTransport.broadcastToWindow')

    const eventName = event.toEventName()
    const win = electron.BrowserWindow.fromId(windowId)
    if (!win) {
      throw new Error(`[TuffTransport] Cannot find BrowserWindow for id=${windowId}`)
    }
    this.channel.broadcastTo(win, LEGACY_CHANNEL.MAIN, eventName, payload)
  }

  /**
   * Sends a message to a specific WebContents.
   */
  async sendTo<TReq, TRes>(
    webContents: WebContents | { webContents?: WebContents | null } | null | undefined,
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
  ): Promise<TRes> {
    assertTuffEvent(event, 'TuffMainTransport.sendTo')

    const eventName = event.toEventName()
    const hostWebContents = (webContents as { webContents?: WebContents | null } | null | undefined)
      ?.webContents
    const directWebContents
      = hostWebContents
        ?? (typeof (webContents as WebContents | null | undefined)?.send === 'function'
          ? (webContents as WebContents)
          : null)
    const targetWebContents = directWebContents

    if (
      !targetWebContents
      || typeof targetWebContents.send !== 'function'
      || typeof targetWebContents.isDestroyed !== 'function'
    ) {
      throw new Error('[TuffTransport] Invalid target WebContents.')
    }

    if (targetWebContents.isDestroyed()) {
      throw new Error('[TuffTransport] Target WebContents has been destroyed.')
    }

    if (isPortChannelEnabled(eventName)) {
      const portLookup = resolvePortRecord(eventName, targetWebContents, 'window')
      if (portLookup) {
        const portSent = postPortMessage(portLookup, {
          channel: eventName,
          portId: portLookup.portId,
          type: 'data',
          payload,
        })
        if (portSent) {
          return undefined as TRes
        }
      }
    }

    return this.channel.sendTo(
      { webContents: targetWebContents } as Electron.BrowserWindow,
      LEGACY_CHANNEL.MAIN,
      eventName,
      payload,
    )
  }

  /**
   * Sends a message to a plugin's renderer.
   */
  async sendToPlugin<TReq, TRes>(
    pluginName: string,
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
  ): Promise<TRes> {
    assertTuffEvent(event, 'TuffMainTransport.sendToPlugin')

    const eventName = event.toEventName()
    return this.channel.sendPlugin(pluginName, eventName, payload)
  }

  /**
   * Broadcasts a message to all windows.
   */
  broadcast<TReq>(
    event: TuffEvent<TReq, void>,
    payload: TReq,
  ): void {
    assertTuffEvent(event, 'TuffMainTransport.broadcast')

    const eventName = event.toEventName()
    this.channel.broadcast(LEGACY_CHANNEL.MAIN, eventName, payload)
  }
}
