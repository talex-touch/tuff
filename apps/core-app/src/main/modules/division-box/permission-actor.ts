import type { HandlerContext } from '@talex-touch/utils/transport/main'

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

export function resolveDivisionBoxPermissionActor(
  context: HandlerContext,
  payload: unknown,
  resolvePluginSdkapi: ResolvePluginSdkapi
): { pluginId?: string; sdkapi?: number } {
  const payloadRecord = toPayloadRecord(payload)
  const contextPluginId = context?.plugin?.name
  const payloadSdkapi = resolvePayloadSdkapi(payloadRecord)

  if (contextPluginId) {
    return {
      pluginId: contextPluginId,
      sdkapi: payloadSdkapi ?? resolvePluginSdkapi(contextPluginId)
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
    sdkapi: payloadSdkapi ?? resolvePluginSdkapi(actorPluginId)
  }
}
