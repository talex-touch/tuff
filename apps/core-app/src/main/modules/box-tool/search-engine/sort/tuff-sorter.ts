import type { TuffQuery } from '@talex-touch/utils/core-box'
import type { ISortMiddleware, TuffItem } from '../types'
import {
  APP_DESTINATION_ITEM_IDS,
  APP_DESTINATION_PROVIDER_ID,
  resolveAppDestinationQuery
} from '../../../../../shared/app-destinations'
import { calculateSearchBehaviorScore } from '../usage-utils'

const DEFAULT_KIND_BIAS: Record<string, number> = {
  app: 12,
  feature: 12,
  command: 11,
  plugin: 8,
  file: 6,
  url: 4,
  text: 4,
  preview: 10000
}

const MATCH_SCORE_MULTIPLIER = 20_000
const FREQUENCY_SCORE_MULTIPLIER = 120_000
const RECENCY_SCORE_MULTIPLIER = 500
const KIND_SCORE_MULTIPLIER = 300
const APP_TITLE_PREFIX_INTENT_BONUS = 480_000
const APP_TITLE_SUBSTRING_INTENT_BONUS = 180_000
const APP_EXACT_TOKEN_INTENT_BONUS = 6_200_000
const APP_PREFIX_TOKEN_INTENT_BONUS = 5_700_000
// A cold-start preference below the smallest app-intent bonus (180,000).
// It applies only to the host-owned destination matching the current query.
const APP_DESTINATION_INTENT_BONUS = 90_000
/**
 * Ceiling for the plugin-supplied `feature.priority` from a manifest.
 *
 * The value was previously unbounded, so a feature declaring `"priority": 100000` scored
 * 100000 * KIND_SCORE_MULTIPLIER = 3e7 and outranked an exact app title match (6_200_000)
 * on every query it recalled on -- contradicting the "soft bias" it is documented to be.
 *
 * 500 puts the ceiling (500 * 300 = 150_000) below the smallest app intent bonus
 * (APP_TITLE_SUBSTRING_INTENT_BONUS = 180_000), while leaving headroom above the largest
 * value any shipped manifest declares: touch-intelligence's 200. Clamping to the range the
 * audit suggested (0..100) would have collapsed that plugin's 200/195/194/193/192 ladder
 * into a single value and destroyed its intended ordering.
 */
const MAX_META_PRIORITY = 500

const LOW_CONFIDENCE_APP_FUZZY_MATCH_CAP = 160
const LOW_CONFIDENCE_FEATURE_FREQUENCY_CAP = 18
const LOW_CONFIDENCE_FEATURE_RECENCY_CAP = 1

/**
 * Match scores for file rows, on their own ladder below app / feature title matches.
 *
 * The index recalls a file for its extension keyword ("md", "pdf", "ts"), and the generic title
 * path splits the title on "." — so README.md scored "md" as a word-prefix hit (500), the same
 * as an app whose name starts with the query, and fifty such files per query buried every app
 * that only matched as a substring, alias or typo. Files therefore match on their stem (the name
 * without its extension): a stem equal to the query sits between an app title prefix (500 +
 * APP_TITLE_PREFIX_INTENT_BONUS) and an app title substring (300 + APP_TITLE_SUBSTRING_INTENT_BONUS),
 * a stem prefix stays under that substring but above a typo-tolerant app hit
 * (LOW_CONFIDENCE_APP_FUZZY_MATCH_CAP), and an extension-only hit is a type-browse signal that
 * ranks under every visible name match. Typing the full file name is still an exact title match.
 */
const FILE_STEM_EXACT_MATCH_SCORE = 420
const FILE_STEM_PREFIX_MATCH_SCORE = 250
const FILE_STEM_SUBSTRING_MATCH_SCORE = 150
const FILE_EXTENSION_ONLY_MATCH_SCORE = 40

/**
 * Path actions — open this folder in a terminal, reveal it in the file manager — outrank ordinary
 * unpinned rows within the same arriving search batch.
 *
 * Only the built-in system provider can claim this band. Plugin metadata alone must not
 * outrank normal file and application results.
 *
 * The band sits far above the largest real score (an exact app-token match is 6.2e6, and the whole
 * ladder stays under 3e7) while still ordering the rows among themselves by the action's own ordinal:
 * default terminal, then the other terminals, then the file manager. Emitting it as a real
 * `scoring.final` preserves that order within each arriving batch. A late unpinned batch still
 * appends below rows already on screen, regardless of score; this band cannot guarantee global
 * first-row placement. Pin, which the caller applies as a partition above all scores, is untouched.
 */
const PATH_ACTION_SCORE_BASE = 1_000_000_000
const PATH_ACTION_MAX_ORDINAL = 99
const PATH_ACTION_ORDINAL_STEP = 1_000

/**
 * The ordinal the emitting provider assigned to this path action, or null when the item is not one.
 *
 * Read from meta rather than the id so a rebuilt item re-ranks exactly as it did when searched.
 */
function getPathActionScore(item: TuffItem): number | null {
  if (item.source?.type !== 'system' || item.source.id !== 'system-actions-provider') return null
  const pathAction = item.meta?.extension?.pathAction as { ordinal?: unknown } | undefined
  const ordinal = Number(pathAction?.ordinal)
  if (!Number.isFinite(ordinal)) return null

  const clamped = Math.min(Math.max(Math.trunc(ordinal), 0), PATH_ACTION_MAX_ORDINAL)
  return PATH_ACTION_SCORE_BASE + (PATH_ACTION_MAX_ORDINAL - clamped) * PATH_ACTION_ORDINAL_STEP
}

function isFileItem(item: TuffItem): boolean {
  return item.kind === 'file' || item.kind === 'folder' || item.source?.type === 'file'
}

function getFileExtension(item: TuffItem, titleLower: string): string {
  const declared = item.meta?.file?.extension
  if (typeof declared === 'string' && declared.trim()) {
    return declared.trim().replace(/^\./, '').toLowerCase()
  }
  const dotIndex = titleLower.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === titleLower.length - 1) return ''
  return titleLower.slice(dotIndex + 1)
}

function calculateFileMatchScore(
  item: TuffItem,
  titleLower: string,
  normalizedKey: string
): number {
  if (!titleLower) return 0

  const extension = getFileExtension(item, titleLower)
  const stem =
    extension && titleLower.endsWith(`.${extension}`)
      ? titleLower.slice(0, -(extension.length + 1))
      : titleLower

  // "notes.md" typed against notes-2024.md: the extension belongs to the query, so the stems match.
  const keyDotIndex = normalizedKey.lastIndexOf('.')
  const stemKey =
    keyDotIndex > 0 && extension && normalizedKey.slice(keyDotIndex + 1) === extension
      ? normalizedKey.slice(0, keyDotIndex)
      : normalizedKey

  if (stem === stemKey) return FILE_STEM_EXACT_MATCH_SCORE
  if (stem.includes(stemKey)) {
    if (stem.startsWith(stemKey) || hasTitleWordPrefixMatch(stem, stemKey)) {
      return FILE_STEM_PREFIX_MATCH_SCORE
    }
    return FILE_STEM_SUBSTRING_MATCH_SCORE
  }

  const extensionKey = normalizedKey.replace(/^\./, '')
  if (extension && extensionKey && extension.startsWith(extensionKey)) {
    return FILE_EXTENSION_ONLY_MATCH_SCORE
  }

  return 0
}

function getKindBias(item: TuffItem): number {
  const kind = item.kind || 'unknown'
  const baseBias = DEFAULT_KIND_BIAS[kind] || 0

  // Feature manifest priority remains effective, but only as a soft bias: it is
  // plugin-supplied, so it is clamped rather than trusted.
  const rawPriority = Number(item.meta?.priority) || 0
  const metaPriority = Math.min(Math.max(rawPriority, 0), MAX_META_PRIORITY)
  return baseBias + metaPriority
}

function getFrequencyWeightFactor(item: TuffItem): number {
  if (item.kind === 'feature') {
    return 1.35
  }

  if (item.kind === 'command') {
    return 1.2
  }

  return 1
}

/**
 * Completion boost from historical "query prefix → executed item" learning.
 *
 * QueryCompletionService.injectCompletionWeights writes the completion stats to
 * `item.meta.completion`. This is the single place the ranker consumes it: the
 * boost is applied as a bounded multiplier on the match contribution (mirroring
 * the service's original `1 + min(count * 0.1, 0.5)` intent, i.e. up to +50%),
 * so a previously-executed result edges out an otherwise equally-scored one
 * without overpowering a genuine exact title match.
 */
function getCompletionBoostFactor(item: TuffItem): number {
  const count = Number(item.meta?.completion?.count) || 0
  if (count <= 0) return 1
  return 1 + Math.min(count * 0.1, 0.5)
}

function getMatchSource(item: TuffItem): string | null {
  const source = item.meta?.extension?.source
  return typeof source === 'string' && source ? source : null
}

function getSearchTokenValues(item: TuffItem): string[] {
  const rawTokens = item.meta?.extension?.searchTokens
  if (!Array.isArray(rawTokens)) return []

  return rawTokens
    .map((token) => {
      if (typeof token === 'string') return token
      if (token && typeof token === 'object') {
        const value = (token as { value?: unknown }).value
        return typeof value === 'string' ? value : ''
      }
      return ''
    })
    .filter(Boolean)
}

function hasSearchTokenMatch(item: TuffItem, normalizedKey: string): boolean {
  return getSearchTokenValues(item).some((token) => {
    const lowerToken = token.toLowerCase()
    return (
      lowerToken === normalizedKey ||
      lowerToken.startsWith(normalizedKey) ||
      lowerToken.includes(normalizedKey)
    )
  })
}

function hasExactSearchTokenMatch(item: TuffItem, normalizedKey: string): boolean {
  return getSearchTokenValues(item).some((token) => token.toLowerCase() === normalizedKey)
}

function hasSearchTokenPrefixMatch(item: TuffItem, normalizedKey: string): boolean {
  return getSearchTokenValues(item).some((token) => {
    const lowerToken = token.toLowerCase()
    return lowerToken !== normalizedKey && lowerToken.startsWith(normalizedKey)
  })
}

function hasTitleWordPrefixMatch(titleLower: string, normalizedKey: string): boolean {
  if (normalizedKey.length < 2) return false

  return titleLower
    .split(/[\s._/\\()[\]{}:+-]+/)
    .filter(Boolean)
    .some((word) => word.startsWith(normalizedKey))
}

function isLowConfidenceFeatureRecall(item: TuffItem, searchKey?: string): boolean {
  if (item.kind !== 'feature') return false

  const normalizedKey = searchKey?.trim().toLowerCase()
  if (!normalizedKey) return false

  const titleLower = item.render.basic?.title?.toLowerCase() || ''
  if (titleLower.includes(normalizedKey)) return false

  const matchSource = getMatchSource(item)
  if (matchSource === 'token' || matchSource === 'fuzzy-token') return true
  if (hasSearchTokenMatch(item, normalizedKey)) return true

  const sourceIdLower = item.source?.id?.toLowerCase()
  return Boolean(sourceIdLower?.includes(normalizedKey))
}

function getAppTitleIntentBonus(item: TuffItem, searchKey?: string): number {
  if (item.kind !== 'app') return 0

  const normalizedKey = searchKey?.trim().toLowerCase()
  if (!normalizedKey || normalizedKey.length < 2) return 0

  const titleLower = item.render.basic?.title?.toLowerCase() || ''
  if (!titleLower.includes(normalizedKey)) return 0

  if (titleLower.startsWith(normalizedKey)) return APP_TITLE_PREFIX_INTENT_BONUS
  if (hasTitleWordPrefixMatch(titleLower, normalizedKey)) return APP_TITLE_PREFIX_INTENT_BONUS
  return APP_TITLE_SUBSTRING_INTENT_BONUS
}

function getAppAliasIntentBonus(item: TuffItem, searchKey?: string): number {
  if (item.kind !== 'app') return 0

  const normalizedKey = searchKey?.trim().toLowerCase()
  if (!normalizedKey || normalizedKey.length < 2) return 0

  if (hasExactSearchTokenMatch(item, normalizedKey)) {
    return APP_EXACT_TOKEN_INTENT_BONUS
  }

  const titleLower = item.render.basic?.title?.toLowerCase() || ''
  if (titleLower.includes(normalizedKey)) return 0

  return hasSearchTokenPrefixMatch(item, normalizedKey) ? APP_PREFIX_TOKEN_INTENT_BONUS : 0
}

function getAppDestinationIntentBonus(item: TuffItem, searchKey?: string): number {
  if (
    !searchKey ||
    item.source?.type !== 'system' ||
    item.source.id !== APP_DESTINATION_PROVIDER_ID
  )
    return 0

  const destination = resolveAppDestinationQuery(searchKey)
  return destination?.searchable && item.id === APP_DESTINATION_ITEM_IDS[destination.id]
    ? APP_DESTINATION_INTENT_BONUS
    : 0
}

/**
 * Calculate match score based on title and source.id matching
 * @param item - TuffItem to calculate score for
 * @param searchKey - Search keyword (lowercase)
 * @returns Match score (higher is better)
 */
function calculateMatchScore(item: TuffItem, searchKey?: string): number {
  const normalizedKey = searchKey?.trim().toLowerCase()

  if (!normalizedKey) return 0

  const title = item.render.basic?.title
  const titleLower = title?.toLowerCase() || ''
  const titleLength = titleLower.length
  const hasDirectTitleMatch = titleLower.includes(normalizedKey)
  const matchSource = getMatchSource(item)
  const searchTokens = getSearchTokenValues(item)
  const isTokenBackedMatch = matchSource === 'token' || matchSource === 'fuzzy-token'

  // Visible title matches should beat hidden token/source matches. This keeps
  // application searches from being displaced by plugin feature aliases.
  if (titleLower === normalizedKey) return 1000

  if (isFileItem(item)) {
    return calculateFileMatchScore(item, titleLower, normalizedKey)
  }

  const matchRanges = item.meta?.extension?.matchResult as
    | { start: number; end: number }[]
    | undefined
  if (titleLength > 0 && matchRanges && matchRanges.length > 0 && !isTokenBackedMatch) {
    // Using the first match range to calculate the score
    const { start, end } = matchRanges[0]
    const matchLength = end - start

    let score = matchSource === 'name-fuzzy' ? 120 : 400

    // 1. Match length reward
    score += (matchLength / titleLength) * 100 // Match length reward

    // 2. Beginning match reward
    if (start === 0) {
      const isInitialsMatch = matchSource === 'initials'
      if (titleLower.startsWith(normalizedKey)) {
        score += 300 // 标题真实开头匹配，大幅加分
      } else if (isInitialsMatch) {
        score += 140 // 缩写命中给适度奖励，避免被别名伪高亮压制
      }
    }

    // 3. Continuity/relevance reward (compared to search term length)
    if (hasDirectTitleMatch && matchLength === normalizedKey.length) {
      score += 200
    }

    // Non-title sources and typo-tolerant title matches may use synthetic ranges.
    // Keep them as recall signals so unrelated fuzzy apps do not outrank intent tokens.
    if (matchSource === 'name-fuzzy') {
      return Math.min(Math.round(score), LOW_CONFIDENCE_APP_FUZZY_MATCH_CAP)
    }

    if (
      !hasDirectTitleMatch &&
      (matchSource === 'tag' || matchSource === 'path' || matchSource === 'description')
    ) {
      return Math.min(Math.round(score), 280)
    }

    return Math.round(score)
  }

  if (titleLength > 0 && titleLower.includes(normalizedKey)) {
    if (titleLower.startsWith(normalizedKey)) return 500
    if (hasTitleWordPrefixMatch(titleLower, normalizedKey)) return 500
    return 300
  }

  // Token match (keywords/pinyin/initials generated at registration). Tokens
  // are recall signals, so they stay below visible title matches.
  if (searchTokens.length > 0) {
    for (const token of searchTokens) {
      const lowerToken = token.toLowerCase()
      if (!lowerToken) continue

      if (lowerToken === normalizedKey) return 260
      if (lowerToken.startsWith(normalizedKey)) return 240
      if (lowerToken.includes(normalizedKey)) return 180
    }
  }

  // Check source.id match for features as a low-confidence fallback.
  if (item.kind === 'feature' && item.source?.id) {
    const sourceIdLower = item.source.id.toLowerCase()

    if (sourceIdLower === normalizedKey) {
      return 250
    }

    if (sourceIdLower.includes(normalizedKey)) {
      if (sourceIdLower.startsWith(normalizedKey)) {
        return 230
      }
      return 170
    }
  }

  return 0
}

export function calculateSortScore(item: TuffItem, searchKey?: string): number {
  // A path action carries its own ordinal and leads everything else; see PATH_ACTION_SCORE_BASE.
  const pathActionScore = getPathActionScore(item)
  if (pathActionScore !== null) return pathActionScore

  const matchScore = calculateMatchScore(item, searchKey)
  const kindBias = getKindBias(item)
  const appTitleIntentBonus = getAppTitleIntentBonus(item, searchKey)
  const appAliasIntentBonus = getAppAliasIntentBonus(item, searchKey)
  let recency = item.scoring?.recency || 0

  // 使用增强的频率计算（从 meta.usageStats 读取）
  let frequency = item.scoring?.frequency || 0

  // 行为分来自真实执行事实：曝光量与取消不再加成，时间衰减由日期构成 (#R3)。
  if (item.meta?.usageStats) {
    frequency = calculateSearchBehaviorScore(item.meta.usageStats)
  }

  if (isLowConfidenceFeatureRecall(item, searchKey)) {
    frequency = Math.min(frequency, LOW_CONFIDENCE_FEATURE_FREQUENCY_CAP)
    recency = Math.min(recency, LOW_CONFIDENCE_FEATURE_RECENCY_CAP)
  }

  // Scoring formula:
  // 1) matchScore 主导排序，避免按 kind 强制置顶；
  // 2) frequency/recency 作为行为学习信号；
  // 3) kindBias 与 manifest priority 仅作为软偏置；
  // 4) feature/command 频次权重略高，提升常用功能的自学习效果；
  // 5) 频次使用 log 增长，避免超高历史次数压过明显更高的匹配分；
  // 6) 补全学习（meta.completion）作为 match 项的有界乘子，让"该前缀历史执行过"的结果在同分时前置。
  const completionBoost = getCompletionBoostFactor(item)
  const frequencyWeighted = Math.log1p(Math.max(0, frequency)) * getFrequencyWeightFactor(item)
  const finalScore =
    matchScore * MATCH_SCORE_MULTIPLIER * completionBoost +
    frequencyWeighted * FREQUENCY_SCORE_MULTIPLIER +
    recency * RECENCY_SCORE_MULTIPLIER +
    kindBias * KIND_SCORE_MULTIPLIER +
    appTitleIntentBonus +
    appAliasIntentBonus +
    getAppDestinationIntentBonus(item, searchKey)

  return finalScore
}

export const tuffSorter: ISortMiddleware = {
  name: 'tuff-sorter',
  sort: (items: TuffItem[], query: TuffQuery) => {
    const searchKey = query.text?.trim().toLowerCase()

    const isPinnedItem = (item: TuffItem): boolean => {
      return Boolean(item.meta?.pinned?.isPinned)
    }

    // Use the Schwartzian transform (decorate-sort-undecorate) for performance.
    // Decorate: Calculate the sort score for each item once.
    const decoratedItems = items.map((item) => ({
      item,
      score: calculateSortScore(item, searchKey),
      pinned: isPinnedItem(item)
    }))

    // Sort: The comparison function is now a simple number comparison.
    decoratedItems.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.score - a.score
    })

    // Undecorate: publish the rank score and the pin partition on the item. The
    // renderer orders the rows of a later batch among themselves by this score
    // before appending them below what is already on screen (it never re-ranks
    // rendered rows), and the completion cache reads it too. Items are
    // shallow-copied because providers reuse the objects they hand in across
    // queries.
    return decoratedItems.map((decorated) => ({
      ...decorated.item,
      scoring: {
        ...decorated.item.scoring,
        final: decorated.score,
        pinned: decorated.pinned
      }
    }))
  }
}
