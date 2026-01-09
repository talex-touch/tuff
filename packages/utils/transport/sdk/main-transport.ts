/**
 * @fileoverview Main process TuffTransport implementation
 * @module @talex-touch/utils/transport/sdk/main-transport
 */

import type {
  HandlerContext,
  ITuffTransportMain,
  PluginKeyManager,
  StreamContext,
} from '../types'
import type { TuffEvent } from '../event/types'
import type { ITouchChannel } from '../../channel'
import { assertTuffEvent } from '../event/builder'
import { ChannelType, DataCode } from '../../channel'
import { STREAM_SUFFIXES } from './constants'

/**
 * Main process transport implementation.
 * Adapts the legacy TouchChannel to the new TuffTransportMain interface.
 */
export class TuffMainTransport implements ITuffTransportMain {
  constructor(
    private channel: ITouchChannel,
    public readonly keyManager: PluginKeyManager,
  ) {}

  /**
   * Registers an event handler.
   */
  on<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    handler: (payload: TReq, context: HandlerContext) => TRes | Promise<TRes>,
  ): () => void {
    assertTuffEvent(event, 'TuffMainTransport.on')

    const eventName = event.toEventName()

    const channelHandler = async (data: any) => {
      // Extract context from channel data
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

      try {
        return await handler(data.data as TReq, context)
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[TuffTransport] Handler error for "${eventName}":`, errorMessage)
        throw error
      }
    }

    return this.channel.regChannel(ChannelType.MAIN, eventName, channelHandler)
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
    const startEventName = `${eventName}${STREAM_SUFFIXES.START}`
    const cancelEventName = `${eventName}${STREAM_SUFFIXES.CANCEL}`

    const streams = new Map<string, { cancelled: boolean }>()

    const startHandler = (data: any) => {
      const rawPayload = data?.data as { streamId?: string; [key: string]: any } | undefined
      const streamId = rawPayload?.streamId
      const sender = data?.header?.event?.sender as any

      if (!streamId || !sender) {
        throw new Error(`[TuffTransport] Invalid stream start for "${eventName}"`)
      }

      streams.set(streamId, { cancelled: false })

      const sendToSender = (name: string, payload: any) => {
        try {
          sender.send('@main-process-message', {
            code: DataCode.SUCCESS,
            data: payload,
            name,
            header: { status: 'request', type: ChannelType.MAIN },
          })
        } catch {
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
          sendToSender(`${eventName}${STREAM_SUFFIXES.DATA}:${streamId}`, { chunk })
        },
        error: (err: Error) => {
          if (streams.get(streamId)?.cancelled)
            return
          sendToSender(`${eventName}${STREAM_SUFFIXES.ERROR}:${streamId}`, {
            error: err instanceof Error ? err.message : String(err),
          })
          cleanup()
        },
        end: () => {
          if (streams.get(streamId)?.cancelled)
            return
          sendToSender(`${eventName}${STREAM_SUFFIXES.END}:${streamId}`, {})
          cleanup()
        },
        isCancelled: () => {
          return streams.get(streamId)?.cancelled === true
        },
        streamId,
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

    const startCleanup = this.channel.regChannel(ChannelType.MAIN, startEventName, startHandler)
    const cancelCleanup = this.channel.regChannel(ChannelType.MAIN, cancelEventName, cancelHandler)

    return () => {
      startCleanup()
      cancelCleanup()
    }
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
    return this.channel.sendTo(win, ChannelType.MAIN, eventName, payload)
  }

  /**
   * Sends a message to a specific WebContents.
   */
  async sendTo<TReq, TRes>(
    webContents: any,
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
  ): Promise<TRes> {
    assertTuffEvent(event, 'TuffMainTransport.sendTo')

    const eventName = event.toEventName()
    
    // Find the BrowserWindow that owns this WebContents
    const { BrowserWindow } = await import('electron')
    const windows = BrowserWindow.getAllWindows()
    const targetWindow = windows.find(win => win.webContents === webContents)
    
    if (!targetWindow) {
      throw new Error(
        '[TuffTransport] Cannot find BrowserWindow for WebContents. '
        + 'Make sure the WebContents belongs to an existing BrowserWindow.',
      )
    }
    
    return this.channel.sendTo(targetWindow, ChannelType.MAIN, eventName, payload)
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
    this.channel.broadcast(ChannelType.MAIN, eventName, payload)
  }
}
