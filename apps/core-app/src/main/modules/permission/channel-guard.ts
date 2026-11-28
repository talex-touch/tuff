/**
 * Middleware for adding permission checks to transport handlers.
 */
import type { TuffEvent } from '@talex-touch/utils/transport'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { CAPABILITY_AUTH_MIN_VERSION } from '@talex-touch/utils/plugin'
import { getPermissionModule } from './permission-module-ref'
import { resolvePermissionPluginDeclaredSdkApi } from './permission-ports'

export interface ProtectedChannelOptions {
  permissionId: string
  errorMessage?: string
  failClosedForPlugin?: boolean
  requireVerifiedPlugin?: boolean
  unavailableCode?: string
  deniedCode?: string
  sdkMismatchCode?: string
}

export type ProtectedHandler<TReq = unknown, TRes = unknown> = (
  payload: TReq,
  context: HandlerContext
) => TRes | Promise<TRes>

interface PayloadWithSdkApi {
  _sdkapi?: number
}

interface SerializablePermissionError {
  name: 'Error'
  message: string
  code: string
  permissionId: string
  pluginId: string
  showRequest?: boolean
}

function extractPayloadSdkApi(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const sdkapi = (payload as PayloadWithSdkApi)._sdkapi
  return typeof sdkapi === 'number' ? sdkapi : undefined
}

function createSerializablePermissionError(
  message: string,
  code: string,
  permissionId: string,
  pluginId: string,
  showRequest?: boolean
): SerializablePermissionError {
  return {
    name: 'Error',
    message,
    code,
    permissionId,
    pluginId,
    ...(showRequest === undefined ? {} : { showRequest })
  }
}

/**
 * Wrap a transport handler with permission checks.
 */
export function withPermission<TReq = unknown, TRes = unknown>(
  options: ProtectedChannelOptions,
  callback: ProtectedHandler<TReq, TRes>
): ProtectedHandler<TReq, TRes> {
  const {
    permissionId,
    errorMessage,
    failClosedForPlugin = false,
    requireVerifiedPlugin = false,
    unavailableCode = 'PERMISSION_UNAVAILABLE',
    deniedCode,
    sdkMismatchCode = 'SDKAPI_MISMATCH'
  } = options

  return async (payload: TReq, context: HandlerContext) => {
    const pluginId = context.plugin?.name
    if (requireVerifiedPlugin && !isAuthoritativePluginContext(context.plugin)) {
      throw createSerializablePermissionError(
        `Verified plugin context is required for '${permissionId}'`,
        deniedCode ?? 'PERMISSION_DENIED',
        permissionId,
        pluginId ?? 'unknown'
      )
    }
    const permModule = getPermissionModule()

    if (!permModule) {
      if (pluginId && failClosedForPlugin) {
        throw createSerializablePermissionError(
          `Permission runtime is unavailable for '${permissionId}'`,
          unavailableCode,
          permissionId,
          pluginId
        )
      }
      return callback(payload, context)
    }

    // Get plugin info from transport context
    const payloadSdkApi = extractPayloadSdkApi(payload)

    // If not from a plugin, allow
    if (!pluginId) {
      return callback(payload, context)
    }

    const declaredSdkApi = await resolvePermissionPluginDeclaredSdkApi(pluginId)
    const authoritativePlugin = isAuthoritativePluginContext(context.plugin)
    if (authoritativePlugin && typeof declaredSdkApi !== 'number') {
      const message = `Plugin sdkapi authority is unavailable for '${pluginId}'`
      if (failClosedForPlugin) {
        throw createSerializablePermissionError(message, sdkMismatchCode, permissionId, pluginId)
      }
      const error = new Error(message) as Error & {
        code?: string
        permissionId?: string
        pluginId?: string
      }
      error.code = sdkMismatchCode
      error.permissionId = permissionId
      error.pluginId = pluginId
      throw error
    }
    const sdkapi = declaredSdkApi ?? payloadSdkApi

    if (
      typeof declaredSdkApi === 'number' &&
      declaredSdkApi >= CAPABILITY_AUTH_MIN_VERSION &&
      typeof payloadSdkApi === 'number' &&
      payloadSdkApi !== declaredSdkApi
    ) {
      if (failClosedForPlugin) {
        throw createSerializablePermissionError(
          `Plugin sdkapi mismatch: payload=${payloadSdkApi}, declared=${declaredSdkApi}`,
          sdkMismatchCode,
          permissionId,
          pluginId
        )
      }
      const error = new Error(
        `Plugin sdkapi mismatch: payload=${payloadSdkApi}, declared=${declaredSdkApi}`
      ) as Error & {
        code?: string
        permissionId?: string
        pluginId?: string
      }
      error.code = sdkMismatchCode
      error.permissionId = permissionId
      error.pluginId = pluginId
      throw error
    }

    // Check permission
    const result = permModule.checkPermission(pluginId, permissionId, sdkapi)

    if (!result.allowed) {
      const message = errorMessage || result.reason || `Permission '${permissionId}' denied`
      if (failClosedForPlugin) {
        throw createSerializablePermissionError(
          message,
          deniedCode ?? result.code ?? 'PERMISSION_DENIED',
          permissionId,
          pluginId,
          result.showRequest
        )
      }
      const error = new Error(message) as Error & {
        code?: string
        permissionId?: string
        pluginId?: string
        showRequest?: boolean
      }
      error.code = deniedCode ?? result.code ?? 'PERMISSION_DENIED'
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
export function createProtectedRegister(transport: ITuffTransportMain) {
  return <TReq = unknown, TRes = unknown>(
    event: TuffEvent<TReq, TRes>,
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
