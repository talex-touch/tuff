import type { ChannelType } from '@talex-touch/utils/channel'
import { genTouchApp } from '../../../../core'
import { TouchApp } from '../../../../core/touch-app'

type Handler<TPayload> = (payload: TPayload) => void

export class CoreBoxTransport {
  private _touchApp: TouchApp | null = null

  private get touchApp(): TouchApp {
    if (!this._touchApp) {
      this._touchApp = genTouchApp()
    }
    return this._touchApp
  }

  public register<TPayload>(
    channelType: ChannelType,
    event: string,
    handler: Handler<TPayload>
  ): void {
    this.touchApp.channel.regChannel(channelType, event, ({ data }) => {
      handler(data as TPayload)
    })
  }
}

export const coreBoxTransport = new CoreBoxTransport()
