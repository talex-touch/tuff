import type { ChannelType } from '@talex-touch/utils/channel'
import type { TouchApp } from '../../../../core/touch-app'
import { genTouchApp } from '../../../../core'

type Handler<TPayload> = (payload: TPayload) => void | TPayload

/**
 * Transport layer for CoreBox IPC communication.
 *
 * Provides a simplified interface for registering channel handlers
 * that automatically extracts payload data from the raw channel message.
 */
export class CoreBoxTransport {
  private _touchApp: TouchApp | null = null

  private get touchApp(): TouchApp {
    if (!this._touchApp) {
      this._touchApp = genTouchApp()
    }
    return this._touchApp
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
  ): void {
    this.touchApp.channel.regChannel(channelType, event, ({ data }) => {
      return handler(data as TPayload)
    })
  }
}

export const coreBoxTransport = new CoreBoxTransport()
