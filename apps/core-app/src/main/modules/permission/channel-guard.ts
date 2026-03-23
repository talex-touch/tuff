/**
 * Middleware for adding permission checks to transport handlers.
 */
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { CAPABILITY_AUTH_MIN_VERSION } from '@talex-touch/utils/plugin'
import { getPermissionModule } from './index'

export interface ProtectedChannelOptions {
  permissionId: string
  errorMessage?: string
}

export type ProtectedHandler<TReq = unknown, TRes = unknown> = (
  payload: TReq,
  context: HandlerContext
) => TRes | Promise<TRes>

interface PayloadWithSdkApi {
  _sdkapi?: number
}
interface PluginLike {
  sdkapi?: number
}

let pluginModuleImport: Promise<{
  pluginModule?: { pluginManager?: { getPluginByName: (name: string) => unknown } }
}> | null = null

function extractPayloadSdkApi(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const sdkapi = (payload as PayloadWithSdkApi)._sdkapi
  return typeof sdkapi === 'number' ? sdkapi : undefined
}

async function resolvePluginDeclaredSdkApi(pluginId: string): Promise<number | undefined> {
  try {
    pluginModuleImport = pluginModuleImport ?? import('../plugin/plugin-module')
    const { pluginModule } = await pluginModuleImport
    const plugin = pluginModule?.pluginManager?.getPluginByName(pluginId) as PluginLike | undefined
    return typeof plugin?.sdkapi === 'number' ? plugin.sdkapi : undefined
  } catch {
    return undefined
  }
}

/**
 * Wrap a transport handler with permission checks.
 */
export function withPermission<TReq = unknown, TRes = unknown>(
  options: ProtectedChannelOptions,
  callback: ProtectedHandler<TReq, TRes>
): ProtectedHandler<TReq, TRes> {
  const { permissionId, errorMessage } = options

  return async (payload: TReq, context: HandlerContext) => {
    const permModule = getPermissionModule()

    // If permission module not loaded, allow (during startup)
    if (!permModule) {
      return callback(payload, context)
    }

    // Get plugin info from transport context
    const pluginId = context.plugin?.name
    const payloadSdkApi = extractPayloadSdkApi(payload)

    // If not from a plugin, allow
    if (!pluginId) {
      return callback(payload, context)
    }

    const declaredSdkApi = await resolvePluginDeclaredSdkApi(pluginId)
    const sdkapi = declaredSdkApi ?? payloadSdkApi

    if (
      typeof declaredSdkApi === 'number' &&
      declaredSdkApi >= CAPABILITY_AUTH_MIN_VERSION &&
      typeof payloadSdkApi === 'number' &&
      payloadSdkApi !== declaredSdkApi
    ) {
      const error = new Error(
        `Plugin sdkapi mismatch: payload=${payloadSdkApi}, declared=${declaredSdkApi}`
      ) as Error & {
        code?: string
        permissionId?: string
        pluginId?: string
      }
      error.code = 'SDKAPI_MISMATCH'
      error.permissionId = permissionId
      error.pluginId = pluginId
      throw error
    }

    // Check permission
    const result = permModule.checkPermission(pluginId, permissionId, sdkapi)

    if (!result.allowed) {
      const message = errorMessage || result.reason || `Permission '${permissionId}' denied`
      const error = new Error(message) as Error & {
        code?: string
        permissionId?: string
        pluginId?: string
        showRequest?: boolean
      }
      error.code = result.code ?? 'PERMISSION_DENIED'
      error.permissionId = permissionId
      error.pluginId = pluginId
      error.showRequest = result.showRequest
      throw error
    }

    return callback(payload, context)
  }
}

/**
 * Helper for registering protected transport handlers.
 */
export function createProtectedRegister(transport: {
  on: <TReq = unknown, TRes = unknown>(
    event: unknown,
    handler: ProtectedHandler<TReq, TRes>
  ) => () => void
}) {
  return <TReq = unknown, TRes = unknown>(
    event: unknown,
    options: ProtectedChannelOptions,
    callback: ProtectedHandler<TReq, TRes>
  ): (() => void) => {
    return transport.on(event, withPermission(options, callback))
  }
}

export interface ProtectedChannelDefinition<TReq = unknown, TRes = unknown> {
  event: unknown
  options: ProtectedChannelOptions
  callback: ProtectedHandler<TReq, TRes>
}

export function registerProtectedChannels(
  transport: {
    on: <TReq = unknown, TRes = unknown>(
      event: unknown,
      handler: ProtectedHandler<TReq, TRes>
    ) => () => void
  },
  definitions: ProtectedChannelDefinition[]
): (() => void)[] {
  return definitions.map((def) =>
    transport.on(def.event, withPermission(def.options, def.callback))
  )
}
