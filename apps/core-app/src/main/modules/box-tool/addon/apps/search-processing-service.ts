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
import { formatLog, generateAcronym, LogStyle } from './app-utils'
import { calculateHighlights } from './highlighting-service'

const SLOW_PROCESS_THRESHOLD_MS = 300

interface ProcessedTuffItem extends TuffItem {
  score: number // 用于排序的内部评分
}

export async function processSearchResults(
  apps: (typeof filesSchema.$inferSelect & { extensions: Record<string, string | null> })[],
  query: TuffQuery,
  isFuzzySearch: boolean,
  aliases: Record<string, string[]>, // 需要传入别名数据
): Promise<ProcessedTuffItem[]> {
  const processStart = startTiming()
  const lowerCaseQuery = query.text.toLowerCase()
  const processedItems: ProcessedTuffItem[] = []

  for (const app of apps) {
    const uniqueId = app.extensions.bundleId || app.path
    const name = app.name
    const displayName = app.displayName || app.name
    const potentialTitles = [displayName, name].filter(Boolean) as string[]

    let bestSource: string = 'unknown'
    let bestHighlights: Range[] = []
    let score = 0
    const aliasList = aliases[uniqueId] || aliases[app.path] || []

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
      fallbackTitle: string,
    ): void => {
      if (newScore <= score)
        return
      const resolvedHighlights = ensureHighlights(rawHighlights, fallbackTitle)
      if (resolvedHighlights.length === 0)
        return
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
          fuzzyResult.score * 0.3, // 模糊匹配分数较低
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
          updateMatch(
            'name-fuzzy',
            [{ start: clampedStart, end: clampedEnd }],
            0.1 + (2 - minFuzzyDist) * 0.05,
            displayName
          )
        }
      }
    }

    if (aliasList.some(alias => alias.toLowerCase().includes(lowerCaseQuery))) {
      updateMatch('tag', calculateHighlights(displayName, lowerCaseQuery), 0.7, displayName)
    }

    for (const title of potentialTitles) {
      if (!title)
        continue
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
          lowerCaseQuery.includes(normalizedAcronym)
          || normalizedAcronym.includes(lowerCaseQuery)
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
        }
        else if (firstPinyin.includes(lowerCaseQuery)) {
          updateMatch('initials', calculateHighlights(title, lowerCaseQuery), 0.6, title)
        }
      }
    }

    // 如果没有任何匹配，跳过此项
    if (score === 0 || bestHighlights.length === 0) {
      continue
    }

    // --- 2. 结果组装 ---
    const iconValue = app.extensions.icon ?? ''
    const tuffItem = new TuffItemBuilder(uniqueId, 'application', 'app-provider')
      .setKind('app')
      .setTitle(displayName)
      .setSubtitle(app.path)
      .setIcon({
        // 根据实际内容动态选择类型：base64 Data URI 用 'url'，文件路径用 'file'
        type: iconValue.startsWith('data:') ? 'url' : 'file',
        value: iconValue,
      })
      .setActions([
        {
          id: 'open-app',
          type: 'open',
          label: 'Open',
          primary: true,
          payload: {
            path: app.path,
          },
        },
      ])
      .setMeta({
        app: {
          path: app.path,
          bundle_id: app.extensions.bundleId || '',
        },
        extension: {
          matchResult: bestHighlights,
          source: bestSource, // 添加来源信息
          keyWords: [...new Set([name, path.basename(app.path).split('.')[0] || ''])].filter(
            Boolean,
          ),
        },
      })
      .setScoring({
        final: score,
      })
      .build()

    processedItems.push({ ...tuffItem, score })

    // Progress tracking removed; keep placeholder for future diagnostics if needed.
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
          apps.length,
        )} items processed`,
        style: 'warning',
        unit: 's',
        precision: 2,
        suffix: '',
      },
      {
        logThresholds: { none: SLOW_PROCESS_THRESHOLD_MS, info: 600, warn: 1200 },
        formatter: entry =>
          formatLog(
            'SearchProcessor',
            `${entry.meta?.message ?? 'Post-processing'} in ${chalk.cyan(
              (entry.durationMs / 1000).toFixed(2),
            )}s`,
            LogStyle.warning,
          ),
        logger: message => console.warn(message),
      },
    )
  }

  return sortedResults
}
