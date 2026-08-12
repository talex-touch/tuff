/**
 * Projects the loaded plugins' features for the agent tools.
 *
 * The catalogue is the same slice CoreBox shows — active plugins, no internal
 * ones, experimental features only in dev mode — so the model can reach exactly
 * what the user could already reach by typing, and the confirmation card names
 * something they recognise.
 *
 * The plugin list arrives as a dependency so the projection stays testable
 * without the plugin subsystem, its database, or Electron.
 */

import type { TuffQuery } from '@talex-touch/utils/core-box/tuff/tuff-dsl'
import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import { TuffInputType } from '@talex-touch/utils/core-box/tuff/tuff-dsl'
import { PluginStatus } from '@talex-touch/utils/plugin'

export interface PluginFeatureEntry {
  /** Stable plugin id — what `tuff_invoke_feature` expects. */
  pluginName: string
  /** What the user calls this plugin, for the confirmation card. */
  pluginLabel: string
  featureId: string
  featureName: string
  description: string
  /** Whether triggering opens the plugin's own surface instead of acting in place. */
  opensUi: boolean
}

export interface FeatureInvocationResult {
  /** The plugin's own verdict; `false` means it refused the trigger. */
  handled: boolean
}

export interface PluginFeatureSource {
  listFeatures: () => PluginFeatureEntry[]
  findFeature: (pluginName: string, featureId: string) => PluginFeatureEntry | null
  /** Rejects when the plugin or feature is gone by the time the user approves. */
  invokeFeature: (
    pluginName: string,
    featureId: string,
    text: string
  ) => Promise<FeatureInvocationResult>
}

export interface PluginFeatureDeps {
  /** Re-read per call, so enabling or reloading a plugin lands on the next turn. */
  listPlugins: () => ITouchPlugin[]
}

function isActive(plugin: ITouchPlugin): boolean {
  return plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE
}

/** Experimental features exist for the developer running the plugin, nobody else. */
function isVisible(plugin: ITouchPlugin, feature: IPluginFeature): boolean {
  return !feature.experimental || Boolean(plugin.dev?.enable)
}

function entryOf(plugin: ITouchPlugin, feature: IPluginFeature): PluginFeatureEntry {
  return {
    pluginName: plugin.name,
    pluginLabel: plugin.displayName?.trim() || plugin.name,
    featureId: feature.id,
    featureName: feature.name,
    description: feature.desc ?? '',
    opensUi: feature.interaction?.type === 'webcontent' || feature.interaction?.type === 'widget'
  }
}

/**
 * Builds the query CoreBox would hand the same feature, so a plugin cannot tell
 * the two callers apart — one that reads `query.inputs` keeps working here.
 */
function buildQuery(feature: IPluginFeature, text: string): TuffQuery {
  const trimmed = text.trim()
  const acceptsText =
    !feature.acceptedInputTypes || feature.acceptedInputTypes.includes(TuffInputType.Text)

  return {
    text: trimmed,
    type: 'text',
    inputs:
      trimmed && acceptsText
        ? [
            {
              type: TuffInputType.Text,
              content: trimmed,
              metadata: { source: 'agent-tools', featureId: feature.id }
            }
          ]
        : []
  }
}

export function createPluginFeatureSource(deps: PluginFeatureDeps): PluginFeatureSource {
  // Internal plugins are created in code and hidden from every user-facing
  // list; offering one here would ask the user to approve something they have
  // no way to recognise.
  const availablePlugins = (): ITouchPlugin[] =>
    deps.listPlugins().filter((plugin) => isActive(plugin) && !plugin.meta?.internal)

  const resolve = (
    pluginName: string,
    featureId: string
  ): { plugin: ITouchPlugin; feature: IPluginFeature } | null => {
    const plugin = availablePlugins().find((candidate) => candidate.name === pluginName)
    if (!plugin) return null
    const feature = plugin.getFeature(featureId)
    return feature && isVisible(plugin, feature) ? { plugin, feature } : null
  }

  return {
    listFeatures: () =>
      availablePlugins().flatMap((plugin) =>
        plugin
          .getFeatures()
          .filter((feature) => isVisible(plugin, feature))
          .map((feature) => entryOf(plugin, feature))
      ),

    findFeature: (pluginName, featureId) => {
      const found = resolve(pluginName, featureId)
      return found ? entryOf(found.plugin, found.feature) : null
    },

    invokeFeature: async (pluginName, featureId, text) => {
      const plugin = availablePlugins().find((candidate) => candidate.name === pluginName)
      if (!plugin) throw new Error(`Plugin "${pluginName}" is not enabled`)
      const feature = plugin.getFeature(featureId)
      if (!feature || !isVisible(plugin, feature)) {
        throw new Error(`Plugin "${pluginName}" has no feature "${featureId}"`)
      }

      // `ITouchPlugin` under-declares this as `void`; the implementation
      // resolves the lifecycle's own return, where `false` is a refusal.
      const verdict = (await plugin.triggerFeature(feature, buildQuery(feature, text))) as
        | boolean
        | void
      return { handled: verdict !== false }
    }
  }
}
