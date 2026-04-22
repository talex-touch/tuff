export const PLUGIN_SDK_BLOCKED_CODE = 'SDKAPI_BLOCKED'

interface PluginSdkBlockedIssueLike {
  code?: string | null
  message?: string | null
}

interface PluginSdkBlockedPluginLike {
  loadState?: string | null
  loadError?: PluginSdkBlockedIssueLike | null
  issues?: PluginSdkBlockedIssueLike[] | null
}

export interface PluginSdkBlockedState {
  blocked: boolean
  message: string
  issue: PluginSdkBlockedIssueLike | null
}

function normalizeMessage(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function findPluginSdkBlockedIssue(
  plugin: PluginSdkBlockedPluginLike
): PluginSdkBlockedIssueLike | null {
  const loadError = plugin.loadError
  if (loadError?.code === PLUGIN_SDK_BLOCKED_CODE) {
    return loadError
  }

  return plugin.issues?.find((issue) => issue?.code === PLUGIN_SDK_BLOCKED_CODE) ?? null
}

export function resolvePluginSdkBlockedState(
  plugin: PluginSdkBlockedPluginLike
): PluginSdkBlockedState {
  const issue = findPluginSdkBlockedIssue(plugin)
  const blocked = plugin.loadState === 'load_failed' && issue !== null
  return {
    blocked,
    message: normalizeMessage(issue?.message),
    issue
  }
}
