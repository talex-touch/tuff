import type {
  MaybePromise,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import { NetworkEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import { getNetworkService } from './network-service'

function resolveKeyManager(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (!('keyManager' in value)) return value
  return (value as { keyManager?: unknown }).keyManager ?? value
}

export class NetworkModule extends BaseModule {
  static key: ModuleKey = Symbol.for('NetworkModule')
  name: ModuleKey = NetworkModule.key

  private readonly disposers: Array<() => void> = []

  constructor() {
    super(NetworkModule.key, {
      create: true,
      dirName: 'network'
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const runtime = resolveMainRuntime(ctx, 'NetworkModule.onInit')
    const transport = getTuffTransportMain(runtime.channel, resolveKeyManager(runtime.channel))
    const service = getNetworkService()

    this.disposers.push(
      transport.on(NetworkEvents.api.request, async (request) => await service.request(request)),
      transport.on(NetworkEvents.api.readText, async (payload) => {
        return await service.readText(payload.source, payload.options)
      }),
      transport.on(NetworkEvents.api.readBinary, async (payload) => {
        return await service.readBinary(payload.source, payload.options)
      }),
      transport.on(NetworkEvents.api.toTfileUrl, (payload) => service.toTfileUrl(payload.source)),
      transport.on(NetworkEvents.api.getConfig, () => service.getConfig()),
      transport.on(NetworkEvents.api.updateConfig, (payload) => service.updateConfig(payload ?? {}))
    )
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): MaybePromise<void> {
    while (this.disposers.length > 0) {
      const dispose = this.disposers.pop()
      dispose?.()
    }
  }
}

export const networkModule = new NetworkModule()
