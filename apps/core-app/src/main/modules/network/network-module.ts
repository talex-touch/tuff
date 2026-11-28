import type {
  MaybePromise,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import { NetworkEvents } from '@talex-touch/utils/transport/events'
import type { NetworkRequest } from '@talex-touch/utils/transport/events/types'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { net, powerMonitor } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import { getNetworkService } from './network-service'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { withPermission } from '../permission/channel-guard'
import { getPermissionModule } from '../permission/permission-module-ref'
import { resolvePermissionPluginDeclaredSdkApi } from '../permission/permission-ports'
import { idleBudgetCoordinator, isStatePausedFor } from '../../service/idle-budget-coordinator'
import { classifyNetworkTarget, isHttpUrl } from '../../utils/network-target-policy'

const NETWORK_STATUS_POLL_INTERVAL_MS = 5000

const NETWORK_RESPONSE_TYPES: Record<string, true> = {
  json: true,
  text: true,
  arrayBuffer: true
}

function sanitizePluginViewNetworkRequest(value: unknown): NetworkRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.hasOwn(record, 'proxyOverride') && record.proxyOverride !== undefined) {
    return null
  }
  if (!Object.hasOwn(record, 'url') || typeof record.url !== 'string' || !isHttpUrl(record.url)) {
    return null
  }

  const sanitized: NetworkRequest = {
    url: record.url
  }

  if (Object.hasOwn(record, 'method') && record.method !== undefined) {
    if (typeof record.method !== 'string') return null
    sanitized.method = record.method as NetworkRequest['method']
  }

  if (Object.hasOwn(record, 'responseType') && record.responseType !== undefined) {
    if (
      typeof record.responseType !== 'string' ||
      !Object.hasOwn(NETWORK_RESPONSE_TYPES, record.responseType)
    ) {
      return null
    }
    sanitized.responseType = record.responseType as NetworkRequest['responseType']
  }

  if (Object.hasOwn(record, 'headers') && record.headers !== undefined) {
    if (!record.headers || typeof record.headers !== 'object' || Array.isArray(record.headers)) {
      return null
    }
    const headers: Record<string, string> = {}
    for (const [key, headerValue] of Object.entries(record.headers as Record<string, unknown>)) {
      if (typeof headerValue !== 'string') return null
      headers[key] = headerValue
    }
    sanitized.headers = headers
  }

  if (Object.hasOwn(record, 'query') && record.query !== undefined) {
    if (!record.query || typeof record.query !== 'object' || Array.isArray(record.query)) {
      return null
    }
    const query: Record<string, string | number | boolean | null | undefined> = {}
    for (const [key, queryValue] of Object.entries(record.query as Record<string, unknown>)) {
      if (
        queryValue !== undefined &&
        queryValue !== null &&
        typeof queryValue !== 'string' &&
        typeof queryValue !== 'number' &&
        typeof queryValue !== 'boolean'
      ) {
        return null
      }
      query[key] = queryValue
    }
    sanitized.query = query
  }

  if (Object.hasOwn(record, 'body') && record.body !== undefined) {
    sanitized.body = record.body
  }

  if (Object.hasOwn(record, 'timeoutMs') && record.timeoutMs !== undefined) {
    if (
      typeof record.timeoutMs !== 'number' ||
      !Number.isFinite(record.timeoutMs) ||
      record.timeoutMs <= 0
    ) {
      return null
    }
    sanitized.timeoutMs = record.timeoutMs
  }

  return sanitized
}

async function hasPluginNetworkPermission(
  pluginId: string,
  permissionId: 'network.local' | 'network.internet'
): Promise<boolean> {
  const permModule = getPermissionModule()
  if (!permModule) return false
  const declaredSdkApi = await resolvePermissionPluginDeclaredSdkApi(pluginId)
  if (typeof declaredSdkApi !== 'number') return false
  return permModule.getGuard().check(pluginId, permissionId, declaredSdkApi).allowed === true
}

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
      readTarget: (payload: TPayload) => unknown,
      options: { allowNonHttp?: boolean } = {}
    ) => {
      const forLocal = withPermission<TPayload, TResult>(
        {
          permissionId: 'network.local',
          errorMessage: 'Permission network.local required',
          failClosedForPlugin: true
        },
        handler
      )
      const forInternet = withPermission<TPayload, TResult>(
        {
          permissionId: 'network.internet',
          errorMessage: 'Permission network.internet required',
          failClosedForPlugin: true
        },
        handler
      )

      return async (payload: TPayload, context: HandlerContext): Promise<TResult> => {
        const target = classifyNetworkTarget(readTarget(payload))
        // Local file sources are only valid on readText/readBinary, never on NetworkEvents.api.request.
        if (target === 'non-http') {
          if (!options.allowNonHttp) {
            throw new Error('NETWORK_UNSUPPORTED_PROTOCOL')
          }
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
          async (request, context) => {
            if (context.plugin) {
              if (!isAuthoritativePluginContext(context.plugin)) {
                throw new Error('PLUGIN_NETWORK_REQUEST_INVALID')
              }
              const sanitizedRequest = sanitizePluginViewNetworkRequest(request)
              if (!sanitizedRequest) {
                throw new Error('PLUGIN_NETWORK_REQUEST_INVALID')
              }
              const target = classifyNetworkTarget(sanitizedRequest.url)
              const allowLocal =
                target === 'local' ||
                (await hasPluginNetworkPermission(context.plugin.name, 'network.local'))
              const allowInternet =
                target === 'internet' ||
                (await hasPluginNetworkPermission(context.plugin.name, 'network.internet'))
              return await service.requestForPlugin(sanitizedRequest, {
                pluginName: context.plugin.name,
                allowLocal,
                allowInternet
              })
            }
            return await service.request(request)
          },
          (request) => (request as { url?: unknown } | undefined)?.url,
          { allowNonHttp: false }
        )
      ),
      transport.on(
        NetworkEvents.api.readText,
        guarded(
          async (payload) => await service.readText(payload.source, payload.options),
          (payload) => payload?.source,
          { allowNonHttp: true }
        )
      ),
      transport.on(
        NetworkEvents.api.readBinary,
        guarded(
          async (payload) => await service.readBinary(payload.source, payload.options),
          (payload) => payload?.source,
          { allowNonHttp: true }
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

    let destroyed = false
    const startStatusPolling = () => {
      if (destroyed || this.statusPollTimer) {
        return
      }
      this.statusPollTimer = setInterval(() => {
        probeStatus('probe')
      }, NETWORK_STATUS_POLL_INTERVAL_MS)
      this.statusPollTimer.unref?.()
    }
    const stopStatusPolling = () => {
      if (!this.statusPollTimer) {
        return
      }
      clearInterval(this.statusPollTimer)
      this.statusPollTimer = null
    }

    const unsubscribeIdle = idleBudgetCoordinator.subscribe((snapshot) => {
      if (destroyed) return
      if (isStatePausedFor(snapshot.state, 'background-hidden')) {
        stopStatusPolling()
        return
      }
      startStatusPolling()
      probeStatus(snapshot.previousState === 'system-suspended' ? 'resume' : 'probe')
    })

    if (!idleBudgetCoordinator.isPausedFor('background-hidden')) {
      startStatusPolling()
    }

    this.disposers.push(() => {
      destroyed = true
      unsubscribeIdle()
      stopStatusPolling()
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
