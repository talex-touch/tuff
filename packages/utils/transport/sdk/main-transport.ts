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
import { ChannelType } from '../../channel'
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

    const startHandler = async (data: { streamId: string; [key: string]: any }) => {
      const { streamId, ...payload } = data

      // Create stream context
      const streamContext: StreamContext<TChunk> = {
        emit: (chunk: TChunk) => {
          // Send chunk via IPC
          const dataEventName = `${eventName}${STREAM_SUFFIXES.DATA}:${streamId}`
          // Note: This requires access to sender WebContents
          // For now, we'll need to store it or pass it through context
          // This is a simplified implementation
        },
        error: (err: Error) => {
          const errorEventName = `${eventName}${STREAM_SUFFIXES.ERROR}:${streamId}`
          // Send error via IPC
        },
        end: () => {
          const endEventName = `${eventName}${STREAM_SUFFIXES.END}:${streamId}`
          // Send end via IPC
        },
        isCancelled: () => {
          // Check if stream was cancelled
          return false
        },
        streamId,
      }

      try {
        await handler(payload as TReq, streamContext)
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[TuffTransport] Stream handler error for "${eventName}":`, errorMessage)
        streamContext.error(error as Error)
      }
    }

    const cancelHandler = (data: { streamId: string }) => {
      // Handle stream cancellation
      // Mark stream as cancelled
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
    // Note: This requires window manager to resolve windowId to BrowserWindow
    // For now, this is a placeholder implementation
    throw new Error('[TuffTransport] sendToWindow not yet implemented')
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

