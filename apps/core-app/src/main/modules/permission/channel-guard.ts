/**
 * Middleware for adding permission checks to transport handlers.
 */
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { getPermissionModule } from './index'

export interface ProtectedChannelOptions {
  permissionId: string
  errorMessage?: string
  allowLegacy?: boolean
}

export type ProtectedHandler<TReq = unknown, TRes = unknown> = (
  payload: TReq,
  context: HandlerContext
) => TRes | Promise<TRes>

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
    const sdkapi =
      payload && typeof payload === 'object' && '_sdkapi' in payload
        ? (payload as { _sdkapi?: number })._sdkapi
        : undefined

    // If not from a plugin, allow
    if (!pluginId) {
      return callback(payload, context)
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
      error.code = 'PERMISSION_DENIED'
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
