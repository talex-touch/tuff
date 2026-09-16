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
  AppDestinationDefinition,
  AppDestinationId
} from '../../../../../shared/app-destinations'
import type { ProviderContext } from '../../search-engine/types'
import { performance } from 'node:perf_hooks'
import { TuffInputType, TuffItemBuilder, TuffSearchResultBuilder } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  COMMON_SETTING_DESTINATION_IDS,
  getAppDestination,
  isAppDestinationId,
  resolveAppDestinationQuery
} from '../../../../../shared/app-destinations'
import { t } from '../../../../utils/i18n-helper'
import { calculateHighlights } from '../apps/highlighting-service'
import { getAppDestinationNavigationService } from '../../../app-destination/app-destination-navigation'

const destinationLog = getLogger('app-destination-provider')

/** Action ID prefix for a destination execute action: `open-destination:<id>`. */
const APP_DESTINATION_ACTION_PREFIX = 'open-destination:'

const MAIN_WINDOW_ITEM_ID = 'main-window'
const PREFIXED_ITEM_ID_PREFIX = 'app-destination:'

/** Upper bound on metadata search tokens; the alias list is small but must stay bounded. */
const MAX_SEARCH_TOKENS = 16

/**
 * Deterministic item id -> destination id. Only the two exact item id shapes this provider
 * emits are accepted; anything else (a stale row, a hand-written id) rebuilds to nothing.
 */
function parseItemId(itemId: string): AppDestinationId | null {
  if (itemId === MAIN_WINDOW_ITEM_ID) {
    return MAIN_WINDOW_ITEM_ID
  }

  if (!itemId.startsWith(PREFIXED_ITEM_ID_PREFIX)) {
    return null
  }

  const candidate = itemId.slice(PREFIXED_ITEM_ID_PREFIX.length)
  return isAppDestinationId(candidate) ? candidate : null
}

/** Allowlisted action id -> destination id, or `null` for forged/unknown ids. */
function parseActionId(actionId: string): AppDestinationId | null {
  if (!actionId.startsWith(APP_DESTINATION_ACTION_PREFIX)) {
    return null
  }

  const candidate = actionId.slice(APP_DESTINATION_ACTION_PREFIX.length)
  return isAppDestinationId(candidate) ? candidate : null
}

export class AppDestinationProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'app-destination-provider'
  readonly type = 'system' as const
  readonly name = 'App Destinations'
  readonly supportedInputTypes = [TuffInputType.Text]
  readonly priority = 'fast' as const

  private context: ProviderContext | null = null

  async onLoad(context: ProviderContext): Promise<void> {
    this.context = context
  }

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startTime = performance.now()
    if (signal.aborted) {
      return this.createEmptyResult(query, startTime)
    }

    const rawText = query.text?.trim() ?? ''
    const definition = rawText ? resolveAppDestinationQuery(rawText) : null
    if (!definition || !definition.searchable) {
      return this.createEmptyResult(query, startTime)
    }

    const item = this.buildDestinationItem(definition, query.text ?? '')
    const duration = performance.now() - startTime

    return new TuffSearchResultBuilder(query)
      .setItems([item])
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name ?? this.id,
          duration,
          resultCount: 1,
          status: 'success'
        }
      ])
      .build()
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const destinationId = this.resolveExecuteDestination(args)
    if (!destinationId) {
      return null
    }

    const context = this.context
    if (!context) {
      destinationLog.warn('App destination navigation requested before provider load')
      return null
    }

    getAppDestinationNavigationService(context.touchApp).open(destinationId)
    return null
  }

  async rebuildRecommendationItems(itemIds: readonly string[]): Promise<TuffItem[]> {
    return itemIds.flatMap((itemId) => {
      const destinationId = parseItemId(itemId)
      if (!destinationId) {
        return []
      }

      const definition = getAppDestination(destinationId)
      return definition.searchable ? [this.buildDestinationItem(definition, '')] : []
    })
  }

  private resolveExecuteDestination(args: IExecuteArgs): AppDestinationId | null {
    const actionId = typeof args.actionId === 'string' ? args.actionId : ''
    if (actionId) {
      return parseActionId(actionId)
    }

    const metaDestination = args.item?.meta?.extension?.destinationId
    return isAppDestinationId(metaDestination) ? metaDestination : null
  }

  private buildDestinationItem(
    definition: AppDestinationDefinition,
    rawQueryText: string
  ): TuffItem {
    const title = t(definition.titleKey)

    return new TuffItemBuilder(
      definition.id === MAIN_WINDOW_ITEM_ID
        ? MAIN_WINDOW_ITEM_ID
        : `${PREFIXED_ITEM_ID_PREFIX}${definition.id}`,
      this.type,
      this.id
    )
      .setKind('command')
      .setTitle(title)
      .setSubtitle(t(definition.subtitleKey))
      .setIcon({
        type: 'class',
        value: definition.icon
      })
      .setActions(this.buildActions(definition, title))
      .setMeta({
        extension: {
          destinationId: definition.id,
          matchResult: this.resolveTitleMatchRanges(title, rawQueryText),
          searchTokens: buildSearchTokens(definition)
        }
      })
      .build()
  }

  /**
   * One primary execute action, plus the ordered common-settings group as secondary actions on the
   * same item. Grouped settings are actions, never extra result rows. The current destination is
   * excluded so its own primary action is not duplicated.
   */
  private buildActions(definition: AppDestinationDefinition, title: string): TuffAction[] {
    const primary: TuffAction = {
      id: `${APP_DESTINATION_ACTION_PREFIX}${definition.id}`,
      type: 'execute',
      label: title,
      primary: true
    }

    if (!definition.id.startsWith('settings-')) {
      return [primary]
    }

    const groupLabel = t('corebox.destinations.commonSettings')
    const grouped = COMMON_SETTING_DESTINATION_IDS.filter(
      (destinationId) => destinationId !== definition.id
    ).map<TuffAction>((destinationId) => ({
      id: `${APP_DESTINATION_ACTION_PREFIX}${destinationId}`,
      type: 'execute',
      label: t(getAppDestination(destinationId).titleKey),
      group: groupLabel
    }))

    return [primary, ...grouped]
  }

  /**
   * Which characters of the title the query actually reached.
   *
   * Matching is already settled by the alias table before this runs, so the only question left is
   * presentational. A literal `indexOf` answers it for a query that shares the title's script -
   * `settings` against "Tuff Settings", `设置` against "Tuff 设置" - and answers nothing for the
   * pinyin aliases that make up most of the catalog: `sz` is a real match the user typed, but it
   * appears nowhere in "Tuff 设置", so the row rendered with no highlight at all.
   *
   * `calculateHighlights` covers the rest: it is what the Windows shell provider already uses, and
   * it maps `sz` and `shezhi` back onto 设置. Fuzzy matching stays off - an alias-table hit needs no
   * typo tolerance, and letting it guess would paint characters the query never named.
   *
   * Aliases whose text simply is not in the title (`偏好设置`, `yysz`) highlight nothing, which is
   * the honest answer rather than a nearest-looking span.
   */
  private resolveTitleMatchRanges(
    title: string,
    rawText: string
  ): Array<{ start: number; end: number }> {
    const trimmedQuery = rawText.trim()
    if (!trimmedQuery) return []

    const directMatch = findTitleRange(title, trimmedQuery)
    if (directMatch) return [directMatch]

    return calculateHighlights(title, trimmedQuery, false) ?? []
  }

  private createEmptyResult(query: TuffQuery, startedAt: number): TuffSearchResult {
    const duration = performance.now() - startedAt
    return new TuffSearchResultBuilder(query)
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name ?? this.id,
          duration,
          resultCount: 0,
          status: 'success'
        }
      ])
      .build()
  }
}

function findTitleRange(title: string, needle: string): { start: number; end: number } | null {
  const normalizedNeedle = needle.trim().toLowerCase()
  if (!normalizedNeedle) return null

  const start = title.toLowerCase().indexOf(normalizedNeedle)
  if (start < 0) return null

  return {
    start,
    end: start + normalizedNeedle.length
  }
}

function buildSearchTokens(definition: AppDestinationDefinition): string[] {
  const tokens: string[] = []
  for (const alias of [
    ...definition.aliases.en,
    ...definition.aliases.zh,
    ...definition.aliases.pinyin
  ]) {
    const token = alias.trim()
    if (token && !tokens.includes(token)) {
      tokens.push(token)
    }
    if (tokens.length >= MAX_SEARCH_TOKENS) {
      break
    }
  }
  return tokens
}

export const appDestinationProvider = new AppDestinationProvider()
