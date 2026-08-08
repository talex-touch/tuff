import type {
  MaybePromise,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import { NetworkEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { net, powerMonitor } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import { getNetworkService } from './network-service'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { withPermission } from '../permission/channel-guard'
import { classifyNetworkTarget } from '../../utils/network-target-policy'

const NETWORK_STATUS_POLL_INTERVAL_MS = 5000

function resolveKeyManager(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (!('keyManager' in value)) return value
  return (value as { keyManager?: unknown }).keyManager ?? value
}

export class NetworkModule extends BaseModule {
  static key: ModuleKey = Symbol.for('NetworkModule')
  name: ModuleKey = NetworkModule.key

  private readonly disposers: Array<() => void> = []
  private statusPollTimer: NodeJS.Timeout | null = null

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
    const publishStatus = (
      online: boolean,
      reason: 'online' | 'offline' | 'resume' | 'manual' | 'probe'
    ) => {
      const previous = service.getStatus()
      const status = service.setOnlineStatus(online, reason)
      if (previous?.online === status.online) {
        return
      }
      transport.broadcast(NetworkEvents.lifecycle.status, status)
      if (online) {
        transport.broadcast(NetworkEvents.lifecycle.online, { ...status, online: true })
        return
      }
      transport.broadcast(NetworkEvents.lifecycle.offline, { ...status, online: false })
    }
    const probeStatus = (reason: 'resume' | 'probe') => {
      if (typeof net?.isOnline !== 'function') {
        return
      }
      publishStatus(net.isOnline(), reason)
    }

    // These three issue requests from the main process, outside any plugin view's session, so
    // they bypass the confinement installPluginViewNavigationPolicy puts on a plugin's own
    // network. They ran with no permission check at all, even though the registry declares
    // network.local and network.internet for exactly this capability (#906).
    //
    // The required permission depends on the destination: reaching localhost admin panels,
    // 169.254.169.254 or the LAN is network.local, the rest is network.internet. withPermission
    // takes a fixed id, so the target is classified first and dispatched to the matching
    // wrapper. Non-plugin callers pass through either way — channel-guard returns early
    // without a plugin id — which is intended here, since the bypass this closes is a plugin
    // escaping its own view policy.
    const guarded = <TPayload, TResult>(
      handler: (payload: TPayload, context: HandlerContext) => Promise<TResult>,
      readTarget: (payload: TPayload) => unknown
    ) => {
      const forLocal = withPermission<TPayload, TResult>(
        { permissionId: 'network.local', errorMessage: 'Permission network.local required' },
        handler
      )
      const forInternet = withPermission<TPayload, TResult>(
        { permissionId: 'network.internet', errorMessage: 'Permission network.internet required' },
        handler
      )

      return async (payload: TPayload, context: HandlerContext): Promise<TResult> => {
        const target = classifyNetworkTarget(readTarget(payload))
        // A local file source is not a network request; the local-file allowlist governs it.
        if (target === 'non-http') {
          return await handler(payload, context)
        }
        const wrapped = target === 'local' ? forLocal : forInternet
        return (await wrapped(payload, context)) as TResult
      }
    }

    this.disposers.push(
      transport.on(
        NetworkEvents.api.request,
        guarded(
          async (request) => await service.request(request),
          (request) => (request as { url?: unknown } | undefined)?.url
        )
      ),
      transport.on(
        NetworkEvents.api.readText,
        guarded(
          async (payload) => await service.readText(payload.source, payload.options),
          (payload) => payload?.source
        )
      ),
      transport.on(
        NetworkEvents.api.readBinary,
        guarded(
          async (payload) => await service.readBinary(payload.source, payload.options),
          (payload) => payload?.source
        )
      ),
      transport.on(NetworkEvents.api.toTfileUrl, (payload) => service.toTfileUrl(payload.source)),
      transport.on(NetworkEvents.api.getConfig, () => service.getConfig()),
      transport.on(NetworkEvents.api.updateConfig, (payload) =>
        service.updateConfig(payload ?? {})
      ),
      transport.on(NetworkEvents.api.clearCooldown, (payload) => {
        service.clearCooldown(payload?.key)
      }),
      transport.on(NetworkEvents.lifecycle.online, (payload) => {
        publishStatus(true, payload?.reason ?? 'online')
      }),
      transport.on(NetworkEvents.lifecycle.offline, (payload) => {
        publishStatus(false, payload?.reason ?? 'offline')
      })
    )

    this.statusPollTimer = setInterval(() => {
      probeStatus('probe')
    }, NETWORK_STATUS_POLL_INTERVAL_MS)
    this.statusPollTimer.unref?.()
    this.disposers.push(() => {
      if (this.statusPollTimer) {
        clearInterval(this.statusPollTimer)
        this.statusPollTimer = null
      }
    })

    if (typeof powerMonitor?.on === 'function') {
      const handleResume = () => {
        probeStatus('resume')
      }
      powerMonitor.on('resume', handleResume)
      this.disposers.push(() => powerMonitor.off('resume', handleResume))
    }

    probeStatus('probe')
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): MaybePromise<void> {
    while (this.disposers.length > 0) {
      const dispose = this.disposers.pop()
      dispose?.()
    }
  }
}

export const networkModule = new NetworkModule()
