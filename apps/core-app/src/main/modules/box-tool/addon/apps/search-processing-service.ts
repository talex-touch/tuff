import type { TuffItem, TuffQuery } from '@talex-touch/utils/core-box'
import type { files as filesSchema } from '../../../../db/schema'
import type { Range } from './highlighting-service'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { startTiming, timingLogger } from '@talex-touch/utils'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import { fuzzyMatch, indicesToRanges } from '@talex-touch/utils/search/fuzzy-match'
import { levenshteinDistance } from '@talex-touch/utils/search/levenshtein-utils'
import chalk from 'chalk'
import { pinyin } from 'pinyin-pro'
import type { AppLaunchKind } from './app-types'
import { formatLog, generateAcronym, LogStyle, parseStringList } from './app-utils'
import { calculateHighlights } from './highlighting-service'
import { createLogger } from '../../../../utils/logger'

const SLOW_PROCESS_THRESHOLD_MS = 300
const searchProcessingLog = createLogger('AppScanner').child('SearchProcessing')
const BASE64_MARKER = 'base64,'
const BASE64_PAYLOAD_PATTERN = /^[A-Za-z0-9+/=]+$/
const MANAGED_ENTRY_SOURCE_KEY = 'entrySource'
const MANAGED_ENTRY_ENABLED_KEY = 'entryEnabled'
const MANAGED_ENTRY_SOURCE_VALUE = 'manual'
const ALTERNATE_NAMES_EXTENSION_KEY = 'alternateNames'

function isValidBase64DataUrl(value: string): boolean {
  const markerIndex = value.indexOf(BASE64_MARKER)
  if (markerIndex === -1) {
    return true
  }
  const payload = value.slice(markerIndex + BASE64_MARKER.length)
  if (!payload) {
    return false
  }
  return BASE64_PAYLOAD_PATTERN.test(payload)
}

interface ProcessedTuffItem extends TuffItem {
  score: number // 用于排序的内部评分
}

type AppSearchRow = typeof filesSchema.$inferSelect & { extensions: Record<string, string | null> }

interface AppMatchState {
  highlights: Range[]
  score: number
  source: string
}

export function isSearchableAppRow(app: AppSearchRow): boolean {
  if (app.extensions[MANAGED_ENTRY_SOURCE_KEY] !== MANAGED_ENTRY_SOURCE_VALUE) {
    return true
  }
  const enabled = app.extensions[MANAGED_ENTRY_ENABLED_KEY]
  return enabled !== '0' && enabled !== 'false'
}

function buildProcessedAppItem(app: AppSearchRow, match: AppMatchState): ProcessedTuffItem {
  const uniqueId = app.extensions.appIdentity || app.path || app.extensions.bundleId || ''
  const name = app.name
  const displayName = app.displayName || app.name
  const subtitle = app.extensions.displayPath || app.path
  const rawIconValue = app.extensions.icon ?? ''
  const iconValue = rawIconValue && !isValidBase64DataUrl(rawIconValue) ? '' : rawIconValue
  const keywordPath = app.extensions.displayPath || app.path
  const launchKind = (app.extensions.launchKind as AppLaunchKind | null) || 'path'
  const description = app.extensions.description || ''
  const alternateNames = parseStringList(app.extensions[ALTERNATE_NAMES_EXTENSION_KEY])

  const tuffItem = new TuffItemBuilder(uniqueId, 'application', 'app-provider')
    .setKind('app')
    .setTitle(displayName)
    .setSubtitle(subtitle)
    .setDescription(description)
    .setIcon({
      type: iconValue.startsWith('data:') ? 'url' : 'file',
      value: iconValue
    })
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
        bundle_id: app.extensions.bundleId || '',
        launchKind,
        launchTarget: app.extensions.launchTarget || app.path,
        launchArgs: app.extensions.launchArgs || '',
        workingDirectory: app.extensions.workingDirectory || '',
        displayPath: app.extensions.displayPath || ''
      },
      extension: {
        matchResult: match.highlights,
        source: match.source,
        keyWords: [
          ...new Set([name, ...alternateNames, path.basename(keywordPath).split('.')[0] || ''])
        ].filter(Boolean)
      }
    })
    .setScoring({
      final: match.score
    })
    .build()

  return { ...tuffItem, score: match.score }
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
  const lowerCaseQuery = query.text.toLowerCase()
  const processedItems: ProcessedTuffItem[] = []

  for (const app of apps) {
    if (!isSearchableAppRow(app)) {
      continue
    }
    const name = app.name
    const displayName = app.displayName || app.name
    const potentialTitles = [displayName, name].filter(Boolean) as string[]
    const alternateNames = parseStringList(app.extensions[ALTERNATE_NAMES_EXTENSION_KEY])
    const uniqueId = app.extensions.appIdentity || app.path || app.extensions.bundleId || ''

    let bestSource: string = 'unknown'
    let bestHighlights: Range[] = []
    let score = 0
    const aliasList =
      aliases[uniqueId] || aliases[app.path] || aliases[app.extensions.bundleId || ''] || []

    const ensureHighlights = (raw: Range[] | null | undefined, fallbackTitle: string): Range[] => {
      if (raw && raw.length > 0) {
        return raw
      }
      const length = fallbackTitle.length
      if (length === 0) {
        return []
      }
      const highlightLength = Math.min(length, Math.max(lowerCaseQuery.length, 1))
      return [{ start: 0, end: highlightLength }]
    }

    const updateMatch = (
      source: string,
      rawHighlights: Range[] | null | undefined,
      newScore: number,
      fallbackTitle: string
    ): void => {
      if (newScore <= score) return
      const resolvedHighlights = ensureHighlights(rawHighlights, fallbackTitle)
      if (resolvedHighlights.length === 0) return
      bestSource = source
      bestHighlights = resolvedHighlights
      score = newScore
    }

    // --- 1. 来源推断与区间计算 ---
    if (isFuzzySearch) {
      // 模糊搜索：使用新的 fuzzyMatch 算法，支持 typo 容错
      const fuzzyResult = fuzzyMatch(displayName, lowerCaseQuery, 2)
      if (fuzzyResult.matched && fuzzyResult.score >= 0.4) {
        updateMatch(
          'name-fuzzy',
          indicesToRanges(fuzzyResult.matchedIndices),
          fuzzyResult.score * 0.5, // edit distance 0 → ~0.5, distance 1 → ~0.4
          displayName
        )
      } else {
        // 回退到原有的滑窗算法
        let minFuzzyDist = Infinity
        let bestFuzzyStart = -1
        let bestFuzzyEnd = -1

        for (let i = 0; i <= displayName.length - lowerCaseQuery.length; i++) {
          const sub = displayName.substring(i, i + lowerCaseQuery.length).toLowerCase()
          const dist = levenshteinDistance(sub, lowerCaseQuery)
          if (dist < minFuzzyDist) {
            minFuzzyDist = dist
            bestFuzzyStart = i
            bestFuzzyEnd = i + lowerCaseQuery.length
          }
        }

        if (minFuzzyDist <= 2 && bestFuzzyStart !== -1) {
          const clampedStart = Math.max(0, bestFuzzyStart)
          const clampedEnd = Math.min(displayName.length, Math.max(clampedStart + 1, bestFuzzyEnd))
          // edit distance 1 → 0.5, distance 2 → 0.3
          updateMatch(
            'name-fuzzy',
            [{ start: clampedStart, end: clampedEnd }],
            minFuzzyDist === 1 ? 0.5 : 0.3,
            displayName
          )
        }
      }
    }

    if (aliasList.some((alias) => alias.toLowerCase().includes(lowerCaseQuery))) {
      updateMatch('tag', calculateHighlights(displayName, lowerCaseQuery), 0.7, displayName)
    }

    for (const title of potentialTitles) {
      if (!title) continue
      const normalizedTitle = title.toLowerCase()

      // Check for exact substring match
      if (normalizedTitle.includes(lowerCaseQuery)) {
        updateMatch('name', calculateHighlights(title, lowerCaseQuery), 0.9, title)
      }

      // Check for multi-word query match (each word matches in order)
      const queryParts = lowerCaseQuery.split(/\s+/).filter(Boolean)
      if (queryParts.length > 1) {
        let allPartsMatch = true
        let searchIndex = 0
        for (const part of queryParts) {
          const idx = normalizedTitle.indexOf(part, searchIndex)
          if (idx === -1) {
            allPartsMatch = false
            break
          }
          searchIndex = idx + part.length
        }
        if (allPartsMatch) {
          updateMatch('name', calculateHighlights(title, lowerCaseQuery), 0.85, title)
        }
      }

      const acronym = generateAcronym(title)
      if (acronym) {
        const normalizedAcronym = acronym.toLowerCase()
        if (
          lowerCaseQuery.includes(normalizedAcronym) ||
          normalizedAcronym.includes(lowerCaseQuery)
        ) {
          updateMatch('initials', calculateHighlights(title, acronym), 0.8, title)
        }
      }

      if (/[\u4E00-\u9FA5]/.test(title)) {
        const fullPinyin = pinyin(title, { toneType: 'none' }).replace(/\s/g, '').toLowerCase()
        const firstPinyin = pinyin(title, { pattern: 'first', toneType: 'none' })
          .replace(/\s/g, '')
          .toLowerCase()

        if (fullPinyin.includes(lowerCaseQuery)) {
          updateMatch('name', calculateHighlights(title, lowerCaseQuery), 0.65, title)
        } else if (firstPinyin.includes(lowerCaseQuery)) {
          updateMatch('initials', calculateHighlights(title, lowerCaseQuery), 0.6, title)
        }
      }
    }

    for (const alternateName of alternateNames) {
      const normalizedAlternateName = alternateName.toLowerCase()

      if (normalizedAlternateName.includes(lowerCaseQuery)) {
        updateMatch('alternate-name', null, 0.86, displayName)
      }

      const queryParts = lowerCaseQuery.split(/\s+/).filter(Boolean)
      if (queryParts.length > 1) {
        let allPartsMatch = true
        let searchIndex = 0
        for (const part of queryParts) {
          const idx = normalizedAlternateName.indexOf(part, searchIndex)
          if (idx === -1) {
            allPartsMatch = false
            break
          }
          searchIndex = idx + part.length
        }
        if (allPartsMatch) {
          updateMatch('alternate-name', null, 0.81, displayName)
        }
      }

      const acronym = generateAcronym(alternateName)
      if (acronym) {
        const normalizedAcronym = acronym.toLowerCase()
        if (
          lowerCaseQuery.includes(normalizedAcronym) ||
          normalizedAcronym.includes(lowerCaseQuery)
        ) {
          updateMatch('alternate-initials', null, 0.76, displayName)
        }
      }

      if (/[\u4E00-\u9FA5]/.test(alternateName)) {
        const fullPinyin = pinyin(alternateName, { toneType: 'none' })
          .replace(/\s/g, '')
          .toLowerCase()
        const firstPinyin = pinyin(alternateName, { pattern: 'first', toneType: 'none' })
          .replace(/\s/g, '')
          .toLowerCase()

        if (fullPinyin.includes(lowerCaseQuery)) {
          updateMatch('alternate-name', null, 0.64, displayName)
        } else if (firstPinyin.includes(lowerCaseQuery)) {
          updateMatch('alternate-initials', null, 0.59, displayName)
        }
      }
    }

    // Path match: check if query appears in the app path
    if (app.path) {
      const normalizedPath = app.path.toLowerCase()
      if (normalizedPath.includes(lowerCaseQuery)) {
        updateMatch('path', calculateHighlights(displayName, lowerCaseQuery), 0.35, displayName)
      }
    }

    // Description match: check if query appears in app description (via extensions)
    const description = app.extensions.description
    if (description) {
      const normalizedDesc = description.toLowerCase()
      if (normalizedDesc.includes(lowerCaseQuery)) {
        updateMatch(
          'description',
          calculateHighlights(displayName, lowerCaseQuery),
          0.4,
          displayName
        )
      }
    }

    // 如果没有任何匹配，跳过此项
    if (score === 0 || bestHighlights.length === 0) {
      continue
    }

    processedItems.push(
      buildProcessedAppItem(app, {
        highlights: bestHighlights,
        score,
        source: bestSource
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
