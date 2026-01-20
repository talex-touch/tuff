/**
 * Middleware for adding permission checks to transport handlers.
 */
import type { HandlerContext } from '@talex-touch/utils/transport'
import { getPermissionModule } from './index'

export interface ProtectedChannelOptions {
  permissionId: string
  errorMessage?: string
  allowLegacy?: boolean
}

export type ProtectedHandler<TReq = any, TRes = any> = (
  payload: TReq,
  context: HandlerContext
) => TRes | Promise<TRes>

/**
 * Wrap a transport handler with permission checks.
 */
export function withPermission<TReq = any, TRes = any>(
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
    const sdkapi = (payload as any)?._sdkapi

    // If not from a plugin, allow
    if (!pluginId) {
      return callback(payload, context)
    }

    // Check permission
    const result = permModule.checkPermission(pluginId, permissionId, sdkapi)

    if (!result.allowed) {
      const message = errorMessage || result.reason || `Permission '${permissionId}' denied`
      const error = new Error(message)
      ;(error as any).code = 'PERMISSION_DENIED'
      ;(error as any).permissionId = permissionId
      ;(error as any).pluginId = pluginId
      ;(error as any).showRequest = result.showRequest
      throw error
    }

    return callback(payload, context)
  }
}

/**
 * Helper for registering protected transport handlers.
 */
export function createProtectedRegister(transport: {
  on: <TReq = any, TRes = any>(event: any, handler: ProtectedHandler<TReq, TRes>) => () => void
}) {
  return <TReq = any, TRes = any>(
    event: any,
    options: ProtectedChannelOptions,
    callback: ProtectedHandler<TReq, TRes>
  ): (() => void) => {
    return transport.on(event, withPermission(options, callback))
  }
}

export interface ProtectedChannelDefinition<TReq = any, TRes = any> {
  event: any
  options: ProtectedChannelOptions
  callback: ProtectedHandler<TReq, TRes>
}

export function registerProtectedChannels(
  transport: {
    on: <TReq = any, TRes = any>(event: any, handler: ProtectedHandler<TReq, TRes>) => () => void
  },
  definitions: ProtectedChannelDefinition[]
): (() => void)[] {
  return definitions.map((def) =>
    transport.on(def.event, withPermission(def.options, def.callback))
  )
}
