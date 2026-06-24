import type { TuffItem, TuffQuery } from '@talex-touch/utils/core-box'
import type {
  FeatureMatchAlias,
  FeatureMatchResult,
  FeatureSearchToken,
  FeatureSearchTokenSource
} from '@talex-touch/utils/search'
import type { files as filesSchema } from '../../../../db/schema'
import type { Range } from './highlighting-service'
import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { startTiming, timingLogger } from '@talex-touch/utils'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import { toTfileUrl } from '@talex-touch/utils/network'
import { buildAppSearchTokens, matchFeature } from '@talex-touch/utils/search'
import chalk from 'chalk'
import { pinyin } from 'pinyin-pro'
import type { AppLaunchKind } from './app-types'
import { formatLog, LogStyle, parseStringList } from './app-utils'
import { resolveDisplayName } from './display-name-sync-utils'
import { createLogger } from '../../../../utils/logger'
import { isAppEntryEnabledExtensionMap } from './app-index-metadata'
import { resolveAppSemanticAliases } from './app-semantic-catalog'
import { resolveAppToolSourceIds } from './app-tool-source-catalog'

const SLOW_PROCESS_THRESHOLD_MS = 300
const searchProcessingLog = createLogger('AppScanner').child('SearchProcessing')
const ALTERNATE_NAMES_EXTENSION_KEY = 'alternateNames'
const APP_FALLBACK_ICON = 'i-ri-apps-line'

interface ProcessedTuffItem extends TuffItem {
  score: number // 用于排序的内部评分
}

type AppSearchRow = typeof filesSchema.$inferSelect & { extensions: Record<string, string | null> }

interface AppMatchState {
  highlights: Range[]
  score: number
  source: string
  alias?: FeatureMatchAlias
  searchTokens?: FeatureSearchToken[]
  toolSources?: string[]
}

export function isSearchableAppRow(app: AppSearchRow): boolean {
  return isAppEntryEnabledExtensionMap(app.extensions)
}

function buildProcessedAppItem(app: AppSearchRow, match: AppMatchState): ProcessedTuffItem {
  const uniqueId = app.extensions.appIdentity || app.path || app.extensions.bundleId || ''
  const name = app.name
  const displayName = resolveDisplayName(app.displayName, app.name)
  const subtitle = app.extensions.displayPath || app.path
  const rawIconValue = app.extensions.icon ?? ''
  const keywordPath = app.extensions.displayPath || app.path
  const launchKind = (app.extensions.launchKind as AppLaunchKind | null) || 'path'
  const description = app.extensions.description || ''
  const alternateNames = parseStringList(app.extensions[ALTERNATE_NAMES_EXTENSION_KEY])
  const icon = resolveAppIcon(rawIconValue)

  const tuffItem = new TuffItemBuilder(uniqueId, 'application', 'app-provider')
    .setKind('app')
    .setTitle(displayName)
    .setSubtitle(subtitle)
    .setDescription(description)
    .setIcon(icon)
    .setActions([
      {
        id: 'open-app',
        type: 'open',
        label: 'Open',
        primary: true,
        payload: {
          path: app.path
        }
      }
    ])
    .setMeta({
      app: {
        path: app.path,
        bundleId: app.extensions.bundleId || '',
        launchKind,
        launchTarget: app.extensions.launchTarget || app.path,
        launchArgs: app.extensions.launchArgs || '',
        workingDirectory: app.extensions.workingDirectory || '',
        displayPath: app.extensions.displayPath || ''
      },
      extension: {
        matchResult: match.highlights,
        matchAlias: match.alias
          ? {
              text: match.alias.text,
              matchResult: match.alias.matchRanges
            }
          : undefined,
        searchTokens: match.searchTokens,
        source: match.source,
        toolSources: match.toolSources,
        keyWords: [
          ...new Set([displayName, name, ...alternateNames, deriveAppFileName(keywordPath)])
        ].filter(Boolean)
      }
    })
    .setScoring({
      final: match.score
    })
    .build()

  return { ...tuffItem, score: match.score }
}

function localFileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function resolveAppIcon(rawIconValue: string): { type: 'url' | 'file' | 'class'; value: string } {
  if (!rawIconValue) {
    return { type: 'file', value: '' }
  }

  if (rawIconValue.startsWith('data:')) {
    return { type: 'url', value: rawIconValue }
  }

  if (!localFileExists(rawIconValue)) {
    return { type: 'class', value: APP_FALLBACK_ICON }
  }

  return { type: 'url', value: toTfileUrl(rawIconValue) }
}

function getPinyinSyllables(text: string): string[] {
  return pinyin(text, { toneType: 'none' })
    .split(/\s+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

function basenameAny(filePath: string): string {
  const value = filePath.trim()
  if (!value) return ''

  const parts = value.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || value
}

function deriveAppFileName(filePath: string): string {
  const baseName = basenameAny(filePath)
  return baseName.replace(/\.(app|exe|lnk|desktop)$/i, '')
}

function normalizeAppMatchScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(1, score / 1000))
}

function resolveAppMatchSource(result: FeatureMatchResult): string {
  if (result.matchedTokenSource) {
    return mapTokenSourceToAppMatchSource(result.matchedTokenSource, result.matchType)
  }

  if (result.matchRanges.length > 0) {
    return result.matchType === 'fuzzy' ? 'name-fuzzy' : 'name'
  }

  return result.matchType === 'fuzzy' ? 'name-fuzzy' : 'description'
}

function mapTokenSourceToAppMatchSource(
  source: FeatureSearchTokenSource,
  matchType: FeatureMatchResult['matchType']
): string {
  switch (source) {
    case 'title':
    case 'name':
    case 'pinyin':
      return matchType === 'fuzzy' ? 'name-fuzzy' : 'name'
    case 'initials':
      return 'initials'
    case 'alternate-name':
      return 'alternate-name'
    case 'alternate-initials':
      return 'alternate-initials'
    case 'alias':
      return 'alias'
    case 'description':
      return 'description'
    case 'path':
    case 'displayPath':
    case 'fileName':
    case 'bundleId':
    case 'appIdentity':
    case 'launchTarget':
      return 'path'
    default:
      return 'token'
  }
}

export function mapAppsToRecommendationItems(apps: AppSearchRow[]): ProcessedTuffItem[] {
  return apps.filter(isSearchableAppRow).map((app) =>
    buildProcessedAppItem(app, {
      highlights: [],
      score: 0,
      source: 'recommendation'
    })
  )
}

export async function processSearchResults(
  apps: AppSearchRow[],
  query: TuffQuery,
  isFuzzySearch: boolean,
  aliases: Record<string, string[]> // 需要传入别名数据
): Promise<ProcessedTuffItem[]> {
  const processStart = startTiming()
  const queryText = query.text.trim()
  const processedItems: ProcessedTuffItem[] = []

  for (const app of apps) {
    if (!isSearchableAppRow(app)) {
      continue
    }

    const name = app.name
    const displayName = resolveDisplayName(app.displayName, app.name)
    const alternateNames = parseStringList(app.extensions[ALTERNATE_NAMES_EXTENSION_KEY])
    const appIdentity = app.extensions.appIdentity || ''
    const uniqueId = appIdentity || app.path || app.extensions.bundleId || ''
    const aliasList =
      aliases[uniqueId] || aliases[app.path] || aliases[app.extensions.bundleId || ''] || []
    const displayPath = app.extensions.displayPath || app.path
    const description = app.extensions.description || ''
    const semanticAliases = resolveAppSemanticAliases({
      name,
      displayName,
      alternateNames,
      path: app.path,
      displayPath,
      fileName: deriveAppFileName(displayPath || app.path || name),
      bundleId: app.extensions.bundleId || '',
      appIdentity,
      launchTarget: app.extensions.launchTarget || app.path,
      description
    })
    const toolSourceIds = resolveAppToolSourceIds({
      name,
      displayName,
      alternateNames,
      path: app.path,
      displayPath,
      fileName: deriveAppFileName(displayPath || app.path || name),
      bundleId: app.extensions.bundleId || '',
      appIdentity,
      launchTarget: app.extensions.launchTarget || app.path,
      description
    })
    const searchTokens = buildAppSearchTokens(
      {
        title: displayName,
        name,
        alternateNames,
        aliases: [...aliasList, ...semanticAliases],
        path: app.path,
        displayPath,
        fileName: deriveAppFileName(displayPath || app.path || name),
        bundleId: app.extensions.bundleId || '',
        appIdentity,
        launchTarget: app.extensions.launchTarget || app.path,
        description
      },
      {
        getSyllables: getPinyinSyllables,
        onError: (error) =>
          searchProcessingLog.warn('Failed to generate app pinyin tokens', { error })
      }
    )

    const result = matchFeature({
      title: displayName,
      desc: description,
      searchTokens,
      query: queryText,
      enableFuzzy: isFuzzySearch
    })

    if (!result.matched) {
      continue
    }

    processedItems.push(
      buildProcessedAppItem(app, {
        highlights: result.matchRanges,
        alias: result.matchedAlias,
        score: normalizeAppMatchScore(result.score),
        source: resolveAppMatchSource(result),
        searchTokens,
        toolSources: toolSourceIds
      })
    )
  }

  // 结果按分数降序排序
  const sortedResults = processedItems.sort((a, b) => b.score - a.score)

  const durationMs = performance.now() - processStart
  if (durationMs > SLOW_PROCESS_THRESHOLD_MS) {
    timingLogger.print(
      'SearchProcessor:PostProcess',
      durationMs,
      {
        message: `Slow post-processing: ${chalk.green(sortedResults.length)} / ${chalk.cyan(
          apps.length
        )} items processed`,
        style: 'warning',
        unit: 's',
        precision: 2,
        suffix: ''
      },
      {
        logThresholds: { none: SLOW_PROCESS_THRESHOLD_MS, info: 600, warn: 1200 },
        formatter: (entry) =>
          formatLog(
            'SearchProcessor',
            `${entry.meta?.message ?? 'Post-processing'} in ${chalk.cyan(
              (entry.durationMs / 1000).toFixed(2)
            )}s`,
            LogStyle.warning
          ),
        logger: (message) => searchProcessingLog.warn(message)
      }
    )
  }

  return sortedResults
}
