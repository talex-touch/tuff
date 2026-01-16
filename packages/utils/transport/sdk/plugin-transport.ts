import type { ITuffTransport, SendOptions, StreamController, StreamOptions } from '../types'
import type { TuffEvent } from '../event/types'
import { assertTuffEvent } from '../event/builder'

type PluginChannelLike = {
  send?: (eventName: string, payload?: any) => Promise<any>
  sendToMain?: (eventName: string, payload?: any) => Promise<any>
  regChannel?: (eventName: string, handler: (data: any) => any) => () => void
  onMain?: (eventName: string, handler: (event: any) => any) => () => void
}

function unwrapPayload<T>(raw: unknown): T {
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    if ('data' in record && 'header' in record) {
      return (record as any).data as T
    }
  }
  return raw as T
}

export class TuffPluginTransport implements ITuffTransport {
  constructor(private readonly channel: PluginChannelLike) {}

  async send<TReq, TRes>(
    event: TuffEvent<TReq, TRes> | TuffEvent<void, TRes>,
    payload?: TReq | void,
    _options?: SendOptions,
  ): Promise<TRes> {
    assertTuffEvent(event as any, 'TuffPluginTransport.send')

    const eventName = (event as any).toEventName() as string
    const sender = typeof this.channel.sendToMain === 'function'
      ? this.channel.sendToMain.bind(this.channel)
      : this.channel.send

    if (!sender) {
      throw new Error('[TuffPluginTransport] Channel send function not available')
    }

    const shouldPassPayload = payload !== undefined
    return sender(eventName, shouldPassPayload ? payload : undefined)
  }

  stream<TReq, TChunk>(
    _event: TuffEvent<TReq, AsyncIterable<TChunk>>,
    _payload: TReq,
    _options: StreamOptions<TChunk>,
  ): Promise<StreamController> {
    throw new Error('[TuffPluginTransport] Stream is not supported in plugin transport')
  }

  on<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    handler: (payload: TReq) => TRes | Promise<TRes>,
  ): () => void {
    assertTuffEvent(event, 'TuffPluginTransport.on')

    const eventName = event.toEventName()

    if (typeof this.channel.onMain === 'function') {
      return this.channel.onMain(eventName, (raw) => handler(unwrapPayload<TReq>(raw)))
    }

    if (typeof this.channel.regChannel === 'function') {
      return this.channel.regChannel(eventName, (raw) => handler(unwrapPayload<TReq>(raw)))
    }

    throw new Error('[TuffPluginTransport] Channel on function not available')
  }

  async flush(): Promise<void> {
    return
  }

  destroy(): void {
    return
  }
}

export function createPluginTuffTransport(channel: PluginChannelLike): ITuffTransport {
  return new TuffPluginTransport(channel)
}
