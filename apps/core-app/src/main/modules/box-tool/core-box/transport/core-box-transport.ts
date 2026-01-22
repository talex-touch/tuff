import type { TouchApp } from '../../../../core/touch-app'
import { ChannelType } from '@talex-touch/utils/channel'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { genTouchApp } from '../../../../core'

type Handler<TPayload> = (payload: TPayload) => void | TPayload

const resolveKeyManager = (channel: { keyManager?: unknown }): unknown =>
  channel.keyManager ?? channel

/**
 * Transport layer for CoreBox IPC communication.
 *
 * Provides a simplified interface for registering channel handlers
 * that automatically extracts payload data from the raw channel message.
 */
export class CoreBoxTransport {
  private _touchApp: TouchApp | null = null
  private transport: ReturnType<typeof getTuffTransportMain> | null = null

  private get touchApp(): TouchApp {
    if (!this._touchApp) {
      this._touchApp = genTouchApp()
    }
    return this._touchApp
  }

  private get tuffTransport(): ReturnType<typeof getTuffTransportMain> {
    if (!this.transport) {
      const channel = this.touchApp.channel
      const keyManager = resolveKeyManager(channel as { keyManager?: unknown })
      this.transport = getTuffTransportMain(channel, keyManager)
    }
    return this.transport
  }

  /**
   * Registers a channel handler for the specified event.
   *
   * @param channelType - The channel type (MAIN or PLUGIN)
   * @param event - The event name to listen for
   * @param handler - The callback function to handle incoming payloads
   */
  public register<TPayload>(
    channelType: ChannelType,
    event: string,
    handler: Handler<TPayload>
  ): () => void {
    const rawEvent = defineRawEvent<TPayload, unknown>(event)
    return this.tuffTransport.on(rawEvent, (payload, context) => {
      const isPlugin = Boolean(context.plugin)
      if (channelType === ChannelType.MAIN && isPlugin) {
        return
      }
      if (channelType === ChannelType.PLUGIN && !isPlugin) {
        return
      }
      return handler(payload as TPayload)
    })
  }
}

export const coreBoxTransport = new CoreBoxTransport()
