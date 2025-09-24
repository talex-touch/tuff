import { TuffItem, TuffItemBuilder, TuffQuery } from '@talex-touch/utils/core-box'
import { files as filesSchema } from '../../../../db/schema'
import path from 'path'
import { pinyin } from 'pinyin-pro'
import { calculateHighlights, Range } from './highlighting-service'
import { levenshteinDistance } from '@talex-touch/utils/search/levenshtein-utils'
import { formatLog, LogStyle, generateAcronym } from './app-utils'
import chalk from 'chalk'
import { performance } from 'perf_hooks'

interface ProcessedTuffItem extends TuffItem {
  score: number // 用于排序的内部评分
}

export async function processSearchResults(
  apps: (typeof filesSchema.$inferSelect & { extensions: Record<string, string | null> })[],
  query: TuffQuery,
  isFuzzySearch: boolean,
  aliases: Record<string, string[]> // 需要传入别名数据
): Promise<ProcessedTuffItem[]> {
  const processStart = performance.now()
  console.log(
    formatLog(
      'SearchProcessor',
      `处理 ${chalk.cyan(apps.length)} 个搜索结果，模式: ${
        isFuzzySearch ? chalk.yellow('模糊搜索') : chalk.green('精确搜索')
      }`,
      LogStyle.process
    )
  )

  const lowerCaseQuery = query.text.toLowerCase()
  const processedItems: ProcessedTuffItem[] = []
  let processedCount = 0

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
      // 模糊搜索：使用滑窗算法找到最佳匹配子串
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

    if (aliasList.some((alias) => alias.toLowerCase().includes(lowerCaseQuery))) {
      updateMatch('tag', calculateHighlights(displayName, lowerCaseQuery), 0.7, displayName)
    }

    for (const title of potentialTitles) {
      if (!title) continue
      const normalizedTitle = title.toLowerCase()

      if (normalizedTitle.includes(lowerCaseQuery)) {
        updateMatch('name', calculateHighlights(title, lowerCaseQuery), 0.9, title)
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

      if (/[\u4e00-\u9fa5]/.test(title)) {
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

    // 如果没有任何匹配，跳过此项
    if (score === 0 || bestHighlights.length === 0) {
      continue
    }

    // --- 2. 结果组装 ---
    const tuffItem = new TuffItemBuilder(uniqueId, 'application', 'app-provider')
      .setKind('app')
      .setTitle(displayName)
      .setSubtitle(app.path)
      .setIcon({
        type: 'base64',
        value: app.extensions.icon || ''
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
          bundle_id: app.extensions.bundleId || ''
        },
        extension: {
          matchResult: bestHighlights,
          source: bestSource, // 添加来源信息
          keyWords: [...new Set([name, path.basename(app.path).split('.')[0] || ''])].filter(
            Boolean
          )
        }
      })
      .setScoring({
        final: score
      })
      .build()

    processedItems.push({ ...tuffItem, score })

    processedCount++
    // Progress tracking without console output
  }

  // 结果按分数降序排序
  const sortedResults = processedItems.sort((a, b) => b.score - a.score)

  console.log(
    formatLog(
      'SearchProcessor',
      `搜索结果处理完成，匹配到 ${chalk.green(sortedResults.length)} / ${chalk.cyan(
        apps.length
      )} 个项目，用时 ${chalk.cyan(((performance.now() - processStart) / 1000).toFixed(2))}s`,
      LogStyle.success
    )
  )

  return sortedResults
}
