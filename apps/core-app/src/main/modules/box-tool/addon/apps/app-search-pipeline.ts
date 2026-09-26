import type { TuffQuery, TuffSearchResult } from '@talex-touch/utils/core-box'
import type { ScannedAppInfo } from './app-types'
import type { AppSearchCatalogService } from './services/app-search-catalog-service'
import { performance } from 'node:perf_hooks'
import { TuffSearchResultBuilder } from '@talex-touch/utils/core-box'
import chalk from 'chalk'
import { matchNoisySystemAppRule } from './app-noise-filter'
import { appProviderLog, logApp, logAppDurationMs } from './app-provider-log'
import { LogStyle } from './app-utils'
import { isSearchableAppRow, processSearchResults } from './search-processing-service'

/**
 * What `AppProvider.onSearch` does once a recall path has its candidates. Both recall paths end
 * here -- the in-memory catalog and the SQL lookups kept as its fallback -- so a result is scored,
 * filtered and logged the same way whichever one found it. Lives beside the provider rather than
 * in it because app-provider.ts is on the module size ratchet (#343).
 */

const SLOW_SEARCH_THRESHOLD_MS = 400

type AppSearchRow = Parameters<typeof processSearchResults>[0][number]

/** One search's candidates as a recall path hands them to {@link finishAppSearch}. */
export interface AppSearchRecallOutcome {
  query: TuffQuery
  rawText: string
  searchStart: number
  signal?: AbortSignal
  appsWithExtensions: AppSearchRow[]
  isFuzzySearch: boolean
  /** Which recall path found the candidates and how many each stage found, for the slow-search line. */
  recallSummary: string
}

/** What the pipeline needs from the provider: one setting and the alias fold. */
export interface AppSearchFinishOptions {
  /** macOS only: leave out helper and system apps that nobody launches from search. */
  hideNoisySystemApps: boolean
  resolveAliases: (app: Pick<ScannedAppInfo, 'bundleId' | 'stableId' | 'path'>) => string[]
}

/**
 * The in-memory path: the catalog's recall funnel, then the same pipeline as the SQL path. No
 * database or read-worker call happens between the keystroke and the result.
 */
export async function searchAppCatalog(
  catalog: Pick<AppSearchCatalogService, 'recall'>,
  input: Pick<AppSearchRecallOutcome, 'query' | 'rawText' | 'searchStart' | 'signal'>,
  options: AppSearchFinishOptions
): Promise<TuffSearchResult> {
  const recall = catalog.recall(input.query)
  if (input.signal?.aborted) {
    return new TuffSearchResultBuilder(input.query).build()
  }
  if (recall.rows.length === 0) {
    logApp('No candidates found for query, returning empty result', LogStyle.info)
    return new TuffSearchResultBuilder(input.query).build()
  }
  const { stats } = recall
  return await finishAppSearch(
    {
      ...input,
      appsWithExtensions: recall.rows,
      isFuzzySearch: recall.isFuzzySearch,
      recallSummary: `memory precise=${chalk.cyan(stats.precise)}, prefix=${chalk.cyan(
        stats.prefix
      )}, fts=${chalk.cyan(stats.fts)}, ngram=${chalk.cyan(stats.ngram)}, subseq=${chalk.cyan(
        stats.subsequence
      )}`
    },
    options
  )
}

/**
 * Everything after candidate recall: the searchable and noisy-system-app filters, scoring, and
 * the slow-search line.
 */
export async function finishAppSearch(
  input: AppSearchRecallOutcome,
  options: AppSearchFinishOptions
): Promise<TuffSearchResult> {
  const { query, rawText, searchStart, signal, appsWithExtensions, isFuzzySearch } = input
  const searchableAppsWithExtensions = appsWithExtensions.filter(isSearchableAppRow)
  const filteredAppsWithExtensions = options.hideNoisySystemApps
    ? (() => {
        const ruleCounts: Record<string, number> = {}
        const filtered = searchableAppsWithExtensions.filter((app) => {
          const rule = matchNoisySystemAppRule({
            path: app.path,
            bundleId: app.extensions.bundleId,
            name: app.displayName || app.name
          })
          if (!rule) {
            return true
          }
          ruleCounts[rule] = (ruleCounts[rule] ?? 0) + 1
          return false
        })
        const filteredCount = searchableAppsWithExtensions.length - filtered.length
        if (filteredCount > 0) {
          appProviderLog.debug('Filtered noisy system apps from search candidates', {
            query: rawText,
            filteredCount,
            ruleCounts
          })
        }
        return filtered
      })()
    : searchableAppsWithExtensions

  const processedResults = await processSearchResults(
    filteredAppsWithExtensions,
    query,
    isFuzzySearch,
    options.resolveAliases
  )

  if (signal?.aborted) {
    return new TuffSearchResultBuilder(query).build()
  }

  const sortedItems = processedResults.map((item) => {
    const { score: _score, ...rest } = item
    return rest
  })

  const elapsedMs = performance.now() - searchStart
  if (elapsedMs > SLOW_SEARCH_THRESHOLD_MS) {
    logAppDurationMs(
      'SlowSearch',
      elapsedMs,
      {
        label: 'Slow search',
        message: `Slow search: ${chalk.cyan(rawText)}`,
        style: 'warning',
        unit: 's',
        precision: 2,
        suffix: `returned ${chalk.green(sortedItems.length)} results (${input.recallSummary})`
      },
      {
        logThresholds: { none: SLOW_SEARCH_THRESHOLD_MS, info: 1000, warn: 2500 },
        logger: (message) => appProviderLog.warn(message)
      }
    )
  }

  return new TuffSearchResultBuilder(query).setItems(sortedItems).build()
}
