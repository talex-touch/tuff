import {
  IFeatureCommand,
  ITouchPlugin,
  IPluginFeature,
  IPluginIcon
} from '@talex-touch/utils/plugin'
import {
  IExecuteArgs,
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSourceType
} from '../box-tool/search-engine/types'
import { genPluginManager } from '../../plugins/plugin-core'

// Manually define the strict type for TuffItem icons based on compiler errors.
type TuffIconType = 'url' | 'emoji' | 'base64' | 'fluent' | 'component'

/**
 * Checks if a feature's command matches the given query text.
 * @param command - The feature command to check.
 * @param queryText - The user's input query.
 * @returns True if the command matches, false otherwise.
 */
function isCommandMatch(command: IFeatureCommand, queryText: string): boolean {
  console.log(
    `[PluginFeaturesAdapter] isCommandMatch: query="${queryText}", command=`,
    JSON.stringify(command)
  )
  if (!command.type) {
    console.log('[PluginFeaturesAdapter] isCommandMatch: No command type, returning true.')
    return true
  }
  if (!queryText && command.type !== 'over') {
    return false
  }

  switch (command.type) {
    case 'over':
      console.log('[PluginFeaturesAdapter] isCommandMatch: type "over", returning true.')
      return true
    case 'match':
      if (Array.isArray(command.value)) {
        return command.value.some((value) => queryText.startsWith(value))
      }
      return queryText.startsWith(command.value as string)
    case 'contain':
      if (Array.isArray(command.value)) {
        return command.value.some((value) => queryText.includes(value))
      }
      return queryText.includes(command.value as string)
    case 'regex':
      return (command.value as RegExp).test(queryText)
    default:
      console.log(
        `[PluginFeaturesAdapter] isCommandMatch: Unknown type "${command.type}", returning false.`
      )
      return false
  }
}

/**
 * Maps the legacy plugin icon type to the new TuffIconType.
 * @param type - The icon type from IPluginIcon.
 * @returns The corresponding TuffIconType.
 */
function mapIconType(type: string): TuffIconType {
  switch (type) {
    case 'file':
      return 'base64'
    case 'remixicon':
      return 'fluent' // Assuming remixicon can be mapped to a font icon like fluent
    case 'class':
      return 'fluent' // Assuming class-based icons are font icons
    default:
      // Fallback for any other type to a default icon type.
      return 'fluent'
  }
}

/**
 * An adapter that exposes features from the legacy plugin system
 * as a modern ISearchProvider.
 */
export class PluginFeaturesAdapter implements ISearchProvider {
  public readonly id = 'plugin-features'
  public readonly type: TuffSourceType = 'plugin'
  public readonly name = 'Plugin Features'

  public async onExecute(args: IExecuteArgs): Promise<boolean> {
    console.log(
      '[PluginFeaturesAdapter] onExecute triggered with args:',
      JSON.stringify(args, null, 2)
    )
    const { pluginName, featureId } = args.item.meta?.extension || {}
    if (!pluginName || !featureId) {
      console.error(
        '[PluginFeaturesAdapter] onExecute: Missing pluginName or featureId in item meta.'
      )
      return false
    }

    const pluginManager = genPluginManager()
    const plugin = pluginManager.plugins.get(pluginName)
    if (!plugin) {
      console.error(`[PluginFeaturesAdapter] Plugin not found: ${pluginName}`)
      return false
    }

    const feature = plugin.getFeature(featureId)
    if (!feature) {
      console.error(
        `[PluginFeaturesAdapter] Feature not found: ${featureId} in plugin ${pluginName}`
      )
      return false
    }

    // Trigger the feature execution in the legacy plugin system
    console.log(
      `[PluginFeaturesAdapter] onExecute: Triggering feature "${feature.id}" in plugin "${plugin.name}" with query text: "${args.searchResult.query.text}"`
    )
    plugin.triggerFeature(feature, args.searchResult.query.text)

    // Return the 'push' property to determine if the provider should be activated
    console.log(`[PluginFeaturesAdapter] onExecute: Returning feature.push value: ${feature.push}`)
    return feature.push
  }

  public async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffItem[]> {
    console.log(`[PluginFeaturesAdapter] onSearch started with query: "${query.text}"`)
    const pluginManager = genPluginManager()
    if (!pluginManager) {
      console.log('[PluginFeaturesAdapter] onSearch: Plugin manager not available.')
      return []
    }

    const queryText = query.text.trim()
    const matchedItems: TuffItem[] = []

    const plugins = pluginManager.plugins.values()

    for (const plugin of plugins as Iterable<ITouchPlugin>) {
      if (signal.aborted) {
        return []
      }

      console.log(`[PluginFeaturesAdapter] onSearch: Checking plugin "${plugin.name}"`)
      const features = plugin.getFeatures()
      for (const feature of features as IPluginFeature[]) {
        const isMatch = feature.commands.some((cmd) => isCommandMatch(cmd, queryText))

        if (isMatch) {
          console.log(
            `[PluginFeaturesAdapter] onSearch: Feature "${feature.name}" from plugin "${plugin.name}" matched.`
          )
          const tuffItem: TuffItem = {
            id: `${plugin.name}/${feature.id}`,
            source: {
              type: this.type,
              id: this.id,
              name: this.name
            },
            kind: 'feature',
            render: {
              mode: 'default',
              basic: {
                title: feature.name,
                subtitle: feature.desc,
                icon: {
                  type: mapIconType((feature.icon as IPluginIcon).type),
                  value: (feature.icon as IPluginIcon).value
                }
              }
            },
            actions: [
              {
                id: 'trigger-feature',
                type: 'execute',
                label: 'Execute',
                primary: true,
                payload: {
                  pluginName: plugin.name,
                  featureId: feature.id
                }
              }
            ],
            from: plugin.name,
            meta: {
              extension: {
                pluginName: plugin.name,
                featureId: feature.id,
                commands: feature.commands
              }
            }
          }
          matchedItems.push(tuffItem)
        }
      }
    }

    console.log(`[PluginFeaturesAdapter] onSearch finished. Found ${matchedItems.length} items.`)
    return matchedItems
  }
}

export default new PluginFeaturesAdapter()
