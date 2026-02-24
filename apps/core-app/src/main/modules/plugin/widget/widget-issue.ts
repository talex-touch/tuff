import type { IPluginFeature, ITouchPlugin, PluginIssue } from '@talex-touch/utils/plugin'

type WidgetFeatureIssue = Omit<PluginIssue, 'type' | 'source' | 'timestamp'> & {
  type?: PluginIssue['type']
}

export function isWidgetFeatureEnabled(plugin: ITouchPlugin, feature: IPluginFeature): boolean {
  if (!feature.experimental) {
    return true
  }
  return Boolean(plugin.dev?.enable)
}

export function pushWidgetFeatureIssue(
  plugin: ITouchPlugin,
  feature: IPluginFeature,
  issue: WidgetFeatureIssue
): void {
  if (!isWidgetFeatureEnabled(plugin, feature)) {
    return
  }

  plugin.issues.push({
    ...issue,
    type: issue.type ?? 'warning',
    source: `feature:${feature.id}`,
    timestamp: Date.now()
  })
}
