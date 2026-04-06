import type { TouchApp } from '../../../../core/touch-app'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { getRegisteredMainRuntime } from '../../../../core/runtime-accessor'

type Handler<TPayload> = (payload: TPayload) => void | TPayload
type TransportScope = 'main' | 'plugin'

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
      this._touchApp = getRegisteredMainRuntime('core-box').app
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
   * @param scope - The transport scope (main/plugin)
   * @param event - The event name to listen for
   * @param handler - The callback function to handle incoming payloads
   */
  public register<TPayload>(
    scope: TransportScope,
    event: string,
    handler: Handler<TPayload>
  ): () => void {
    const rawEvent = defineRawEvent<TPayload, unknown>(event)
    return this.tuffTransport.on(rawEvent, (payload, context) => {
      const isPlugin = Boolean(context.plugin)
      if (scope === 'main' && isPlugin) {
        return
      }
      if (scope === 'plugin' && !isPlugin) {
        return
      }
      return handler(payload as TPayload)
    })
  }
}

export const coreBoxTransport = new CoreBoxTransport()
