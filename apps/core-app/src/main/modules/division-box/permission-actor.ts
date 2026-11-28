import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { DivisionBoxError, DivisionBoxErrorCode } from '@talex-touch/utils'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'

type ResolvePluginSdkapi = (pluginId?: string) => number | undefined

function toPayloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  return payload as Record<string, unknown>
}

function resolveNestedSourcePluginId(payload: Record<string, unknown> | null): string | undefined {
  const nestedPayload = payload?.payload
  if (!nestedPayload || typeof nestedPayload !== 'object') {
    return undefined
  }
  const contextPayload = (nestedPayload as Record<string, unknown>).context
  if (!contextPayload || typeof contextPayload !== 'object') {
    return undefined
  }
  const sourcePluginId = (contextPayload as Record<string, unknown>).sourcePluginId
  return typeof sourcePluginId === 'string' ? sourcePluginId : undefined
}

function resolvePayloadSdkapi(payload: Record<string, unknown> | null): number | undefined {
  const payloadSdkapi = payload?._sdkapi
  return typeof payloadSdkapi === 'number' ? payloadSdkapi : undefined
}

function resolveVerifiedSdkapi(
  pluginId: string,
  payloadSdkapi: number | undefined,
  resolvePluginSdkapi: ResolvePluginSdkapi,
  contextSdkapi?: number
): number | undefined {
  const declaredSdkapi =
    typeof contextSdkapi === 'number' ? contextSdkapi : resolvePluginSdkapi(pluginId)
  if (
    typeof declaredSdkapi === 'number' &&
    typeof payloadSdkapi === 'number' &&
    payloadSdkapi !== declaredSdkapi
  ) {
    const error = new Error(
      `Plugin sdkapi mismatch: payload=${payloadSdkapi}, declared=${declaredSdkapi}`
    ) as Error & { code?: string; pluginId?: string }
    error.code = 'SDKAPI_MISMATCH'
    error.pluginId = pluginId
    throw error
  }
  return declaredSdkapi ?? payloadSdkapi
}

export function resolveDivisionBoxPermissionActor(
  context: HandlerContext,
  payload: unknown,
  resolvePluginSdkapi: ResolvePluginSdkapi
): { pluginId?: string; sdkapi?: number } {
  const payloadRecord = toPayloadRecord(payload)
  const payloadSdkapi = resolvePayloadSdkapi(payloadRecord)

  if (context?.plugin) {
    if (!isAuthoritativePluginContext(context.plugin)) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.PERMISSION_DENIED,
        'DivisionBox operations require an authoritative plugin caller.'
      )
    }
    const contextPluginId = context.plugin.name
    const rawContextSdkapi = (context.plugin as { sdkapi?: unknown }).sdkapi
    const contextSdkapi = typeof rawContextSdkapi === 'number' ? rawContextSdkapi : undefined
    return {
      pluginId: contextPluginId,
      sdkapi: resolveVerifiedSdkapi(
        contextPluginId,
        payloadSdkapi,
        resolvePluginSdkapi,
        contextSdkapi
      )
    }
  }

  const actorPluginId =
    (typeof payloadRecord?.actorPluginId === 'string' ? payloadRecord.actorPluginId : undefined) ??
    resolveNestedSourcePluginId(payloadRecord)

  if (!actorPluginId || actorPluginId === 'corebox') {
    return {}
  }

  return {
    pluginId: actorPluginId,
    sdkapi: resolveVerifiedSdkapi(actorPluginId, payloadSdkapi, resolvePluginSdkapi)
  }
}
