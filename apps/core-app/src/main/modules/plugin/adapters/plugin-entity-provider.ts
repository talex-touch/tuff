import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffAction,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type {
  IPluginFeature,
  IPluginManager,
  ITouchPlugin,
  PluginIssue
} from '@talex-touch/utils/plugin'
import type { FeatureSearchToken } from '@talex-touch/utils/search'
import type { ProviderContext } from '../../box-tool/search-engine/types'
import type {
  PluginEntityActionId,
  PluginEntityFeature,
  PluginEntityProblem,
  PluginEntitySnapshot,
  PluginEntityState
} from '../../../../shared/plugin-entity'
import { performance } from 'node:perf_hooks'
import { TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { matchFeature } from '@talex-touch/utils/search'
import { shell } from 'electron'
import { resolveAppDestinationQuery } from '../../../../shared/app-destinations'
import {
  isPluginEntityActionId,
  PLUGIN_ENTITY_ACTION_FAILED,
  PLUGIN_ENTITY_ACTION_IDS,
  PLUGIN_ENTITY_ITEM_ID_PREFIX,
  PLUGIN_ENTITY_ITEM_KIND,
  PLUGIN_ENTITY_PERMISSION_REQUIRED,
  PLUGIN_ENTITY_PROVIDER_ID,
  resolvePluginEntityPrimaryAction
} from '../../../../shared/plugin-entity'
import { getRegisteredMainRuntime } from '../../../core/runtime-accessor'
import { t } from '../../../utils/i18n-helper'
import { getAppDestinationNavigationService } from '../../app-destination/app-destination-navigation'
import type { IPluginManagerWithInternals } from '../plugin-module'
import { pluginModule } from '../plugin-module'
import { setPluginEnabledAndBroadcast } from '../services/plugin-api-transport-service'
import { buildPluginEntitySearchTokens } from './feature-search-tokens'
import pluginFeaturesAdapter, { toCoreBoxIcon } from './plugin-features-adapter'

const pluginEntityLog = getLogger('plugin-entity-provider')

/**
 * Below this a query is a prefix of half the catalog (`t` → every `touch-*`): plugin rows would
 * crowd out the apps and files the user is typing towards.
 */
const MIN_NAME_QUERY_LENGTH = 2

/**
 * Destinations whose aliases mean "my plugins". Typing one of them lists every installed plugin
 * under the destination row, so the list and the page answer the same words.
 */
const LIST_INTENT_DESTINATIONS: Readonly<Record<string, true>> = {
  'store-installed': true,
  'settings-plugins': true
}

const STATE_ORDER: Readonly<Record<PluginEntityState, number>> = {
  enabled: 0,
  'dev-disconnected': 1,
  failed: 2,
  crashed: 3,
  loading: 4,
  disabled: 5
}

const ACTION_LABEL_KEYS: Readonly<
  Record<Exclude<PluginEntityActionId, 'plugin-entity:run-feature'>, string>
> = {
  'plugin-entity:enable': 'corebox.pluginEntity.actions.enable',
  'plugin-entity:disable': 'corebox.pluginEntity.actions.disable',
  'plugin-entity:reload': 'corebox.pluginEntity.actions.reload',
  'plugin-entity:open-folder': 'corebox.pluginEntity.actions.openFolder',
  'plugin-entity:open-detail': 'corebox.pluginEntity.actions.openDetail'
}

export function resolvePluginEntityState(plugin: ITouchPlugin): PluginEntityState {
  if (plugin.loadState === 'load_failed') return 'failed'
  switch (plugin.status) {
    case PluginStatus.ENABLED:
    case PluginStatus.ACTIVE:
      return 'enabled'
    case PluginStatus.LOADING:
      return 'loading'
    case PluginStatus.LOAD_FAILED:
      return 'failed'
    case PluginStatus.CRASHED:
      return 'crashed'
    case PluginStatus.DEV_DISCONNECTED:
    case PluginStatus.DEV_RECONNECTING:
      return 'dev-disconnected'
    default:
      return 'disabled'
  }
}

/**
 * The load error, or the first error issue. A load error is a copy of one of the plugin's issues
 * without the details its words need, so the issue it copies is sent while the plugin still has it.
 */
function resolveProblem(plugin: ITouchPlugin): PluginEntityProblem | undefined {
  const loadError = plugin.loadError
  if (loadError?.message?.trim()) {
    const issue = loadError.code
      ? plugin.issues?.find((candidate) => candidate.code === loadError.code)
      : undefined
    return toProblem(issue ?? { type: 'error', code: loadError.code, message: loadError.message })
  }
  const issue = plugin.issues?.find((candidate) => candidate.type === 'error')
  return issue?.message?.trim() ? toProblem(issue) : undefined
}

function toProblem(issue: PluginIssue): PluginEntityProblem {
  const problem: PluginEntityProblem = { type: issue.type, message: issue.message.trim() }
  if (issue.code) problem.code = issue.code
  if (issue.source) problem.source = issue.source
  if (issue.suggestion) problem.suggestion = issue.suggestion
  if (issue.meta && typeof issue.meta === 'object' && !Array.isArray(issue.meta)) {
    problem.meta = issue.meta
  }
  return problem
}

/**
 * The feature's own row, minus what only the search path reads. The row is executed through the
 * renderer's plugin-feature path, which needs its identity, interaction and commands — the search
 * tokens are a search-time cache and the bulk of its size.
 */
function toRunnableFeatureItem(plugin: ITouchPlugin, feature: IPluginFeature): TuffItem {
  const item = pluginFeaturesAdapter.createTuffItem(plugin, feature)
  const extension = { ...item.meta?.extension }
  delete extension.searchTokens
  delete extension.matchResult
  delete extension.matchAlias
  return { ...item, meta: { ...item.meta, extension } }
}

export function buildPluginEntitySnapshot(plugin: ITouchPlugin): PluginEntitySnapshot {
  const state = resolvePluginEntityState(plugin)
  const runnable = state === 'enabled'
  const features: PluginEntityFeature[] = plugin
    .getFeatures()
    .filter((feature) => pluginFeaturesAdapter.isFeatureVisible(plugin, feature))
    .map((feature) => ({
      id: feature.id,
      name: feature.name,
      desc: feature.desc,
      icon: toCoreBoxIcon(feature.icon),
      item: runnable ? toRunnableFeatureItem(plugin, feature) : undefined
    }))

  return {
    name: plugin.name,
    displayName: plugin.displayName?.trim() || plugin.name,
    version: plugin.version,
    description: plugin.desc ?? '',
    state,
    primaryAction: resolvePluginEntityPrimaryAction(state, features.length > 0 && runnable),
    problem: resolveProblem(plugin),
    dev: Boolean(plugin.dev?.enable),
    features
  }
}

function actionLabel(actionId: PluginEntityActionId, snapshot: PluginEntitySnapshot): string {
  if (actionId === PLUGIN_ENTITY_ACTION_IDS.runFeature) {
    const feature = snapshot.features.find((candidate) => candidate.item)
    return t('corebox.pluginEntity.actions.runFeature', { name: feature?.name ?? '' })
  }
  return t(ACTION_LABEL_KEYS[actionId])
}

/**
 * The primary action first, then whichever management steps apply to the current state. One of
 * enable/disable, never both: the row says what pressing it would change.
 */
export function buildPluginEntityActions(snapshot: PluginEntitySnapshot): TuffAction[] {
  const ids: PluginEntityActionId[] = [snapshot.primaryAction]
  if (snapshot.state === 'enabled') ids.push(PLUGIN_ENTITY_ACTION_IDS.disable)
  if (snapshot.state === 'disabled') ids.push(PLUGIN_ENTITY_ACTION_IDS.enable)
  if (snapshot.state !== 'loading') ids.push(PLUGIN_ENTITY_ACTION_IDS.reload)
  ids.push(PLUGIN_ENTITY_ACTION_IDS.openFolder, PLUGIN_ENTITY_ACTION_IDS.openDetail)

  const unique = [...new Set(ids)]
  return unique.map((id, index) => ({
    id,
    type: 'execute',
    label: actionLabel(id, snapshot),
    ...(index === 0 ? { primary: true } : {})
  }))
}

interface MatchedPlugin {
  plugin: ITouchPlugin
  score: number
  matchResult: Array<{ start: number; end: number }>
}

interface CachedTokens {
  key: string
  tokens: FeatureSearchToken[]
}

export class PluginEntityProvider implements ISearchProvider<ProviderContext> {
  readonly id = PLUGIN_ENTITY_PROVIDER_ID
  readonly type = 'system' as const
  readonly name = 'Plugins'
  readonly supportedInputTypes = [TuffInputType.Text]
  readonly priority = 'fast' as const

  private context: ProviderContext | null = null
  /** Pinyin per keystroke is the expensive part; keyed by every field the tokens read. */
  private readonly tokenCache = new WeakMap<ITouchPlugin, CachedTokens>()

  async onLoad(context: ProviderContext): Promise<void> {
    this.context = context
  }

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startedAt = performance.now()
    const rawText = query.text?.trim() ?? ''
    const manager = pluginModule.pluginManager
    if (signal.aborted || !rawText || !manager) {
      return this.createResult(query, [], startedAt)
    }

    const plugins = [...manager.plugins.values()].filter((plugin) => !plugin.meta?.internal)
    const listIntent = Object.hasOwn(
      LIST_INTENT_DESTINATIONS,
      resolveAppDestinationQuery(rawText)?.id ?? ''
    )

    const matched = listIntent
      ? plugins.map<MatchedPlugin>((plugin) => ({ plugin, score: 0, matchResult: [] }))
      : this.matchPlugins(plugins, rawText)

    const items = matched
      .sort((a, b) => this.compareMatches(a, b))
      .map((match) => this.buildItem(match))

    return this.createResult(query, signal.aborted ? [] : items, startedAt)
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const manager = pluginModule.pluginManager
    const plugin = manager ? this.resolvePlugin(manager, args.item) : null
    if (!manager || !plugin) {
      throw new Error('PLUGIN_ENTITY_NOT_FOUND')
    }

    const requested = typeof args.actionId === 'string' ? args.actionId : ''
    const actionId = requested ? requested : buildPluginEntitySnapshot(plugin).primaryAction
    if (!isPluginEntityActionId(actionId)) {
      throw new Error('PLUGIN_ENTITY_ACTION_UNKNOWN')
    }

    switch (actionId) {
      case PLUGIN_ENTITY_ACTION_IDS.enable:
      case PLUGIN_ENTITY_ACTION_IDS.disable: {
        const { transport } = getRegisteredMainRuntime('plugin-module')
        const enabled = actionId === PLUGIN_ENTITY_ACTION_IDS.enable
        if (await setPluginEnabledAndBroadcast(manager, transport, plugin.name, enabled)) {
          return null
        }
        // Enabling a plugin whose permissions were never confirmed parks it and asks on a card in
        // the main window; it enables itself once the user answers. Bring that card forward.
        const pending = (manager as IPluginManagerWithInternals).pendingPermissionPlugins
        if (enabled && pending?.has(plugin.name)) {
          this.revealMainWindow()
          throw new Error(PLUGIN_ENTITY_PERMISSION_REQUIRED)
        }
        throw new Error(PLUGIN_ENTITY_ACTION_FAILED)
      }
      case PLUGIN_ENTITY_ACTION_IDS.reload:
        await manager.reloadPlugin(plugin.name)
        return null
      case PLUGIN_ENTITY_ACTION_IDS.openFolder: {
        // `openPath` resolves to an error string rather than rejecting.
        const failure = await shell.openPath(plugin.pluginPath)
        if (failure) {
          pluginEntityLog.warn('Failed to open plugin folder', { meta: { plugin: plugin.name } })
          throw new Error(PLUGIN_ENTITY_ACTION_FAILED)
        }
        return null
      }
      case PLUGIN_ENTITY_ACTION_IDS.openDetail:
      case PLUGIN_ENTITY_ACTION_IDS.runFeature: {
        // `run-feature` reaches main only when the row lost its feature item between search and
        // Enter; the detail page is the honest fallback, never a guessed feature.
        const context = this.context
        if (!context) throw new Error(PLUGIN_ENTITY_ACTION_FAILED)
        const result = getAppDestinationNavigationService(context.touchApp).openPlugin(plugin.name)
        if (result.status === 'unavailable') throw new Error(PLUGIN_ENTITY_ACTION_FAILED)
        return null
      }
    }
  }

  private revealMainWindow(): void {
    if (!this.context) return
    getAppDestinationNavigationService(this.context.touchApp).open('main-window')
  }

  private resolvePlugin(manager: IPluginManager, item: TuffItem | undefined): ITouchPlugin | null {
    const itemId = typeof item?.id === 'string' ? item.id : ''
    if (!itemId.startsWith(PLUGIN_ENTITY_ITEM_ID_PREFIX)) return null
    const plugin = manager.plugins.get(itemId.slice(PLUGIN_ENTITY_ITEM_ID_PREFIX.length))
    return plugin && !plugin.meta?.internal ? plugin : null
  }

  private matchPlugins(plugins: ITouchPlugin[], rawText: string): MatchedPlugin[] {
    if (rawText.length < MIN_NAME_QUERY_LENGTH) return []

    const matches: MatchedPlugin[] = []
    for (const plugin of plugins) {
      const title = plugin.displayName?.trim() || plugin.name
      const result = matchFeature({
        title,
        desc: plugin.desc,
        searchTokens: this.resolveTokens(plugin),
        query: rawText,
        enableFuzzy: false
      })
      if (result.matched && result.score > 0) {
        matches.push({ plugin, score: result.score, matchResult: result.matchRanges })
      }
    }
    return matches
  }

  private resolveTokens(plugin: ITouchPlugin): FeatureSearchToken[] {
    const key = `${plugin.name}\u0000${plugin.displayName ?? ''}\u0000${plugin.desc ?? ''}`
    const cached = this.tokenCache.get(plugin)
    if (cached?.key === key) return cached.tokens
    const tokens = buildPluginEntitySearchTokens(plugin)
    this.tokenCache.set(plugin, { key, tokens })
    return tokens
  }

  private compareMatches(a: MatchedPlugin, b: MatchedPlugin): number {
    if (a.score !== b.score) return b.score - a.score
    const stateDelta =
      STATE_ORDER[resolvePluginEntityState(a.plugin)] -
      STATE_ORDER[resolvePluginEntityState(b.plugin)]
    if (stateDelta !== 0) return stateDelta
    const aName = a.plugin.displayName?.trim() || a.plugin.name
    const bName = b.plugin.displayName?.trim() || b.plugin.name
    return aName.localeCompare(bName)
  }

  private buildItem(match: MatchedPlugin): TuffItem {
    const { plugin } = match
    const snapshot = buildPluginEntitySnapshot(plugin)
    const actions = buildPluginEntityActions(snapshot)
    const primaryLabel = typeof actions[0]?.label === 'string' ? actions[0].label : undefined

    return {
      id: `${PLUGIN_ENTITY_ITEM_ID_PREFIX}${plugin.name}`,
      source: { type: this.type, id: this.id, name: this.name },
      kind: PLUGIN_ENTITY_ITEM_KIND,
      render: {
        mode: 'default',
        basic: {
          title: snapshot.displayName,
          subtitle: t('corebox.pluginEntity.subtitle', {
            state: t(`corebox.pluginEntity.state.${snapshot.state}`),
            version: snapshot.version
          }),
          icon: plugin.icon ? toCoreBoxIcon(plugin.icon) : undefined
        }
      },
      actions,
      meta: {
        // Managing a plugin is done in place: enabling it, reloading it and re-reading its state
        // keep CoreBox open. Leaving for the detail page or a feature does not.
        keepCoreBoxOpen:
          snapshot.primaryAction === PLUGIN_ENTITY_ACTION_IDS.enable ||
          snapshot.primaryAction === PLUGIN_ENTITY_ACTION_IDS.reload,
        footerHints: primaryLabel ? { primary: { label: primaryLabel } } : undefined,
        extension: {
          pluginEntity: snapshot,
          matchResult: match.matchResult,
          searchTokens: [plugin.name]
        }
      }
    }
  }

  private createResult(query: TuffQuery, items: TuffItem[], startedAt: number): TuffSearchResult {
    const duration = performance.now() - startedAt
    return new TuffSearchResultBuilder(query)
      .setItems(items)
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name,
          duration,
          resultCount: items.length,
          status: 'success'
        }
      ])
      .build()
  }
}

export const pluginEntityProvider = new PluginEntityProvider()
