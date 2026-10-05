import type { FlowPayload, TuffItem } from '@talex-touch/utils'

/**
 * The Flow payload CoreBox sends for an item, and the identities read off it.
 *
 * Pure, and shared by the two renderers a transfer crosses: the ⌘K card's Flow page
 * (`meta-flow-page.ts`, in the overlay view) asks for targets and consent as the sender this
 * payload names, and the CoreBox renderer (`useDetach`) builds the same payload to dispatch it.
 * One function, so the sender consent was granted to is the sender that dispatches.
 */

/** The plugin that owns an item: its `pluginName`, else the plugin provider that listed it. */
export function resolveFeaturePluginId(item: TuffItem): string | undefined {
  const pluginName = item.meta?.pluginName
  if (typeof pluginName === 'string' && pluginName.trim()) {
    return pluginName
  }
  if (item.source?.type === 'plugin' && item.source.id !== 'plugin-features') {
    return item.source.id
  }
  return undefined
}

export function buildCoreBoxFlowPayload(item: TuffItem, query: string): FlowPayload {
  return {
    type: 'json',
    data: { item, query },
    context: {
      sourcePluginId: resolveFeaturePluginId(item) ?? 'corebox',
      sourceFeatureId: item.meta?.featureId
    }
  }
}

export function resolveCoreBoxFlowActorPluginId(payload: FlowPayload | null): string | undefined {
  if (!payload || payload.type !== 'json') {
    return undefined
  }
  const data = payload.data as { item?: TuffItem } | undefined
  const item = data?.item
  if (item?.source?.type !== 'plugin') {
    return undefined
  }
  return resolveFeaturePluginId(item)
}
