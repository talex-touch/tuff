import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  ITuffIcon,
  TuffIconType,
  TuffItem,
  TuffQuery,
  TuffSearchResult,
  TuffSourceType
} from '@talex-touch/utils'
import type { IFeatureCommand, IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { ProviderContext } from '../../box-tool/search-engine/types'
import type { TouchPlugin } from '../plugin'
import { TuffFactory, TuffInputType } from '@talex-touch/utils'
import { matchFeature, type MatchRange } from '@talex-touch/utils/search'
import { PluginStatus } from '@talex-touch/utils/plugin'
import searchEngineCore from '../../box-tool/search-engine/search-core'
import { pluginModule } from '../plugin-module'

import { PluginViewLoader } from '../view/plugin-view-loader'
import { genTouchApp } from '../../../core'
import { buildFeatureSearchTokens } from './feature-search-tokens'

function isCommandMatch(command: IFeatureCommand, queryText: string): boolean {
  if (!command.type) {
    return true
  }
  if (!queryText && command.type !== 'over') {
    return false
  }

  switch (command.type) {
    case 'over':
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
      return false
  }
}

function mapIconType(type: string): TuffIconType {
  switch (type) {
    case 'file':
      return 'file'
    case 'remixicon':
    case 'class':
      return 'emoji'
    default:
      return 'emoji'
  }
}
export class PluginFeaturesAdapter implements ISearchProvider<ProviderContext> {
  public readonly id = 'plugin-features'
  public readonly type: TuffSourceType = 'plugin'
  public readonly name = 'Plugin Features'
  public readonly supportedInputTypes = [
    TuffInputType.Text,
    TuffInputType.Image,
    TuffInputType.Files,
    TuffInputType.Html
  ]
  public readonly priority = 'fast' as const
  public readonly expectedDuration = 30

  public async handleActiveFeatureInput(query: TuffQuery): Promise<boolean> {
    const activationState = searchEngineCore.getActivationState()

    const activeFeatureActivation = activationState?.find((a) => a.id === this.id)
    if (!activeFeatureActivation?.meta?.pluginName) {
      return false
    }

    const { pluginName, featureId } = activeFeatureActivation.meta
    const plugin = pluginModule.pluginManager!.plugins.get(pluginName) as TouchPlugin | undefined
    const feature = plugin?.getFeature(featureId)

    if (!plugin || !feature || !this.isPluginActive(plugin)) {
      return false
    }

    // For webcontent features, initial query is already sent via attachUIView on dom-ready
    // Only forward subsequent input changes if plugin has enabled input monitoring
    if (feature.interaction?.type === 'webcontent') {
      // Skip initial activation - attachUIView already sends 'initial' source event
      // Subsequent changes will be forwarded via WindowManager.forwardInputChange if inputAllowed
      return true
    }

    const hasContent = query.text || (query.inputs && query.inputs.length > 0)

    genTouchApp().channel.sendToPlugin(plugin.name, 'core-box:input-change', {
      source: 'feature-activation',
      query
    })

    if (!hasContent) {
      return true
    }

    try {
      const result = await plugin.triggerFeature(feature, query)
      await plugin.triggerInputChanged(feature, query)

      if (result === false) {
        return false
      }

      return true
    } catch (error) {
      console.error('[PluginFeaturesAdapter] handleActiveFeatureInput error:', error)
      return false
    }
  }

  public async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const { item } = args

    if (item.meta?.defaultAction) {
      const pluginName = item.meta?.pluginName
      if (!pluginName) {
        console.error(
          '[PluginFeaturesAdapter] onExecute (Action): Missing pluginName in item.meta.'
        )
        return null
      }

      const plugin = pluginModule.pluginManager!.plugins.get(pluginName) as TouchPlugin | undefined

      if (plugin?.pluginLifecycle?.onItemAction) {
        const actionStartTime = Date.now()

        try {
          const result = await plugin.pluginLifecycle.onItemAction(item)
          const executionTime = Date.now() - actionStartTime
          const isExternalAction = executionTime > 100 || result?.externalAction === true

          if (isExternalAction) {
            return null
          }

          if (result?.shouldActivate) {
            return result.activation || null
          }
        } catch (error) {
          console.error(`[PluginFeaturesAdapter] Error in onItemAction for ${pluginName}:`, error)
        }

        return null
      } else {
        console.warn(
          `[PluginFeaturesAdapter] Plugin ${pluginName} has defaultAction but no onItemAction handler.`
        )
        return null
      }
    }

    const meta = item.meta || {}
    const extension = meta.extension || {}
    const pluginName =
      meta.pluginName || extension.pluginName || item.actions?.[0]?.payload?.pluginName
    const featureId = meta.featureId || extension.featureId || item.actions?.[0]?.payload?.featureId

    if (!pluginName || !featureId) {
      console.error('[PluginFeaturesAdapter] onExecute (Feature): Missing pluginName or featureId.')
      return null
    }

    const plugin = pluginModule.pluginManager!.plugins.get(pluginName)
    if (!plugin || !this.isPluginActive(plugin)) {
      console.error(
        `[PluginFeaturesAdapter] Plugin not found or not active: ${pluginName} (status: ${plugin?.status})`
      )
      return null
    }

    const feature = plugin.getFeature(featureId)
    if (!feature) {
      console.error(
        `[PluginFeaturesAdapter] Feature not found: ${featureId} in plugin ${pluginName}`
      )
      return null
    }

    if (feature.interaction && feature.interaction.type === 'webcontent') {
      const query = args.searchResult?.query

      // Determine if input should be shown while webcontent view is attached
      const hasAcceptedInputTypes = feature.acceptedInputTypes && feature.acceptedInputTypes.length > 0
      const allowInput = feature.interaction?.allowInput === true
      const shouldShowInput = hasAcceptedInputTypes || allowInput

      // IMPORTANT: Pre-activate the provider BEFORE loading the plugin view
      // This ensures items pushed by the plugin during onFeatureTriggered
      // have the correct activation state for proper cleanup on exit
      const activation: IProviderActivate = {
        id: this.id,
        name: plugin.name,
        icon: {
          type: mapIconType((plugin.icon as ITuffIcon).type),
          value: (plugin.icon as ITuffIcon).value
        },
        meta: {
          pluginName,
          featureId,
          pluginIcon: plugin.icon,
          feature: item
        },
        hideResults: true, // webcontent mode - hide results area for plugin UI view
        showInput: shouldShowInput
      }
      searchEngineCore.activateProviders([activation])

      await PluginViewLoader.loadPluginView(plugin as TouchPlugin, feature, query)

      if (
        plugin.issues.some(
          (issue) => issue.code === 'INVALID_VIEW_PATH' && issue.source === `feature:${feature.id}`
        )
      ) {
        // Deactivate if view loading failed
        searchEngineCore.deactivateProvider(`${this.id}:${pluginName}`)
        return null
      }

      // Return the same activation object (already activated above)
      return activation
    }

    const query = args.searchResult?.query || args.searchResult?.query?.text

    // For push-mode features, pre-activate BEFORE triggering to ensure
    // items pushed during onFeatureTriggered have correct activation state
    if (feature.push) {
      // Determine if input should be shown based on feature config
      const hasAcceptedInputTypes = feature.acceptedInputTypes && feature.acceptedInputTypes.length > 0
      const allowInput = feature.interaction?.allowInput === true
      const shouldShowInput = hasAcceptedInputTypes || allowInput

      const activation: IProviderActivate = {
        id: this.id,
        meta: {
          pluginName,
          featureId,
          pluginIcon: plugin.icon,
          feature: item
        },
        hideResults: false, // push mode - show results area for pushed items
        showInput: shouldShowInput // show input if feature accepts input types or has allowInput
      }
      searchEngineCore.activateProviders([activation])

      const shouldActivate = await plugin.triggerFeature(feature, query)

      if (typeof shouldActivate === 'boolean' && shouldActivate === false) {
        // Deactivate if feature explicitly returns false
        searchEngineCore.deactivateProvider(`${this.id}:${pluginName}`)
        return null
      }

      return activation
    }

    // For non-push features, use original flow
    const shouldActivate = await plugin.triggerFeature(feature, query)

    if (typeof shouldActivate === 'boolean' && shouldActivate === false) {
      return null
    }

    if (typeof shouldActivate === 'boolean' && shouldActivate === true) {
      return {
        id: this.id,
        meta: {
          pluginName,
          featureId,
          pluginIcon: plugin.icon,
          feature: item
        }
      }
    }

    return null
  }

  private isPluginActive(plugin: ITouchPlugin): boolean {
    return plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE
  }

  private createTuffItem(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    matchResult?: MatchRange[]
  ): TuffItem {
    const searchTokens = feature.searchTokens ?? buildFeatureSearchTokens(feature)
    feature.searchTokens = searchTokens

    return {
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
            type: mapIconType((feature.icon as ITuffIcon).type),
            value: (feature.icon as ITuffIcon).value
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
      meta: {
        pluginName: plugin.name,
        featureId: feature.id,
        interaction: feature.interaction,
        priority: feature.priority ?? 0,
        extension: {
          // Filter out non-serializable fields (functions, RegExp) from commands
          commands: feature.commands.map((cmd) => ({
            type: cmd.type,
            value: typeof cmd.value === 'function' || cmd.value instanceof RegExp
              ? String(cmd.value)
              : cmd.value
          })),
          searchTokens,
          // Match result for UI highlighting
          matchResult,
          // Include acceptedInputTypes for frontend UI decisions
          acceptedInputTypes: feature.acceptedInputTypes
        }
      }
    }
  }

  public async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const activationState = searchEngineCore.getActivationState()

    if (activationState) {
      const activeFeatureActivation = activationState.find((a) => a.id === this.id)
      if (activeFeatureActivation?.meta?.pluginName) {
        const { pluginName, featureId } = activeFeatureActivation.meta
        const plugin = pluginModule.pluginManager!.plugins.get(pluginName) as TouchPlugin
        const feature = plugin?.getFeature(featureId)

        if (plugin && feature && this.isPluginActive(plugin)) {
          if (!query.text) {
            const allFeatures = plugin.getFeatures()
            const items = allFeatures
              .map((f) => this.createTuffItem(plugin, f))
              .sort((a, b) => (b.meta?.priority ?? 0) - (a.meta?.priority ?? 0))
            return TuffFactory.createSearchResult(query)
              .setItems(items)
              .setActivate(activationState)
              .build()
          }

          return TuffFactory.createSearchResult(query).setActivate(activationState).build()
        }
      }
    }

    const queryText = query.text.trim()
    const matchedItems: Array<{ item: TuffItem; matchScore: number }> = []
    const plugins = pluginModule.pluginManager!.plugins.values()

    const queryInputTypes = query.inputs?.map((i) => i.type) || []
    // Text and Html are considered as text-like inputs
    const isTextLike = (t: TuffInputType) => t === TuffInputType.Text || t === TuffInputType.Html
    const hasNonTextInput =
      queryInputTypes.length > 0 && queryInputTypes.some((t) => !isTextLike(t))

    // Get text content from clipboard inputs for command matching
    const clipboardTextContent = query.inputs?.find((i) => isTextLike(i.type))?.content ?? ''

    for (const plugin of plugins as Iterable<ITouchPlugin>) {
      if (signal.aborted) {
        return TuffFactory.createSearchResult(query).build()
      }

      if (!this.isPluginActive(plugin)) {
        continue
      }

      const features = plugin.getFeatures()
      for (const feature of features as IPluginFeature[]) {
        // Ensure search tokens are built
        if (!feature.searchTokens) {
          feature.searchTokens = buildFeatureSearchTokens(feature)
        }

        // Check if feature accepts the input types
        if (hasNonTextInput) {
          if (!feature.acceptedInputTypes) {
            continue
          }

          const acceptsAllInputs = queryInputTypes.every((type) =>
            feature.acceptedInputTypes?.includes(type as TuffInputType)
          )

          if (!acceptsAllInputs) {
            continue
          }
        }

        const hasInputs = queryInputTypes.length > 0
        const featureAcceptsInputs = hasInputs && feature.acceptedInputTypes?.some((t) =>
          queryInputTypes.includes(t as TuffInputType)
        )

        const matchesCommand = queryText && feature.commands.some((cmd) => isCommandMatch(cmd, queryText))
        const matchesClipboardCommand = clipboardTextContent && feature.commands.some((cmd) => isCommandMatch(cmd, clipboardTextContent))

        let matchResult: MatchRange[] | undefined
        let matchScore = 0

        if (queryText) {
          const result = matchFeature({
            title: feature.name,
            desc: feature.desc,
            searchTokens: feature.searchTokens,
            query: queryText,
            enableFuzzy: true
          })

          if (result.matched) {
            matchResult = result.matchRanges
            matchScore = result.score
          }
        }

        // Show feature if: command matches, OR feature accepts the input types (e.g., image)
        if (matchesCommand || matchesClipboardCommand || featureAcceptsInputs) {
          matchedItems.push({
            item: this.createTuffItem(plugin, feature, matchResult),
            matchScore: 1000 + (feature.priority ?? 0)
          })
          continue
        }

        // Fuzzy text match fallback
        if (matchResult && matchScore > 0) {
          matchedItems.push({
            item: this.createTuffItem(plugin, feature, matchResult),
            matchScore: matchScore + (feature.priority ?? 0)
          })
        }
      }
    }

    // Sort by match score (highest first), then by priority
    const sortedItems = matchedItems
      .sort((a, b) => b.matchScore - a.matchScore)
      .map((m) => m.item)

    return TuffFactory.createSearchResult(query).setItems(sortedItems).build()
  }
}

export default new PluginFeaturesAdapter()
