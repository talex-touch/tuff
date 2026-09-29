import { fuzzyMatch } from '@talex-touch/utils/search'
import path from 'node:path'

const SCORE_MATCH = 16
const SCORE_BOUNDARY = 10
const SCORE_CAMEL = 7
const SCORE_CONSECUTIVE = 12
const SCORE_GAP_START = -3
const SCORE_GAP_EXTENSION = -1
const NO_SCORE = Number.NEGATIVE_INFINITY

/**
 * Score one already-bounded file candidate with fzf-style subsequence priorities.
 * Exact and prefix ownership stays with the caller; this value is only the fuzzy stage signal.
 */
export function scoreFileFuzzyMatch(query: string, fileName: string, filePath: string): number {
  const normalizedQuery = query.normalize('NFC').trim()
  if (!normalizedQuery) return 0

  const normalizedName = fileName.normalize('NFC')
  const stem = path.basename(normalizedName, path.extname(normalizedName))
  const normalizedPath = filePath.normalize('NFC')
  const lowerQuery = normalizedQuery.toLowerCase()
  const lowerName = normalizedName.toLowerCase()
  const lowerStem = stem.toLowerCase()

  if (lowerName === lowerQuery || lowerStem === lowerQuery) return 1
  if (lowerName.startsWith(lowerQuery) || lowerStem.startsWith(lowerQuery)) return 0.97
  if (lowerName.includes(lowerQuery) || lowerStem.includes(lowerQuery)) return 0.92

  const nameScore = scoreFzfSubsequence(normalizedName, normalizedQuery)
  const pathScore = scoreFzfSubsequence(normalizedPath, normalizedQuery) * 0.82
  const typoScore = Math.max(
    fuzzyMatch(normalizedName, normalizedQuery).score,
    fuzzyMatch(stem, normalizedQuery).score
  )
  return clampScore(Math.max(nameScore, pathScore, typoScore * 0.72))
}

/**
 * Linear-space dynamic program inspired by fzf's ranking priorities: word boundaries and
 * consecutive runs win, while a new gap and each extra skipped character pay a penalty.
 */
export function scoreFzfSubsequence(target: string, query: string): number {
  const targetChars = Array.from(target.normalize('NFC'))
  const targetLower = targetChars.map((char) => char.toLowerCase())
  const queryLower = Array.from(query.normalize('NFC'), (char) => char.toLowerCase())
  const targetLength = targetChars.length
  if (queryLower.length === 0 || targetLength === 0 || queryLower.length > targetLength) return 0

  let previous = new Float64Array(targetLength)
  let current = new Float64Array(targetLength)
  previous.fill(NO_SCORE)

  for (let queryIndex = 0; queryIndex < queryLower.length; queryIndex += 1) {
    current.fill(NO_SCORE)
    let bestGappedPrefix = NO_SCORE

    for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
      if (queryIndex > 0 && targetIndex >= 2) {
        const previousIndex = targetIndex - 2
        const previousScore = previous[previousIndex]
        if (Number.isFinite(previousScore)) {
          bestGappedPrefix = Math.max(
            bestGappedPrefix,
            previousScore - SCORE_GAP_EXTENSION * previousIndex
          )
        }
      }
      if (targetLower[targetIndex] !== queryLower[queryIndex]) continue

      const characterScore = SCORE_MATCH + resolveBoundaryBonus(targetChars, targetIndex)
      if (queryIndex === 0) {
        const leadingGap =
          targetIndex === 0
            ? 0
            : SCORE_GAP_START + SCORE_GAP_EXTENSION * Math.max(0, targetIndex - 1)
        current[targetIndex] = characterScore + leadingGap
        continue
      }

      let best = NO_SCORE
      if (targetIndex > 0 && Number.isFinite(previous[targetIndex - 1])) {
        best = previous[targetIndex - 1] + SCORE_CONSECUTIVE
      }
      if (Number.isFinite(bestGappedPrefix)) {
        const gapped =
          bestGappedPrefix + SCORE_GAP_START + SCORE_GAP_EXTENSION * Math.max(0, targetIndex - 2)
        best = Math.max(best, gapped)
      }
      if (Number.isFinite(best)) current[targetIndex] = best + characterScore
    }

    const swap = previous
    previous = current
    current = swap
  }

  let best = NO_SCORE
  for (let index = 0; index < targetLength; index += 1) {
    if (!Number.isFinite(previous[index])) continue
    const trailingPenalty = SCORE_GAP_EXTENSION * Math.max(0, targetLength - index - 1) * 0.2
    best = Math.max(best, previous[index] + trailingPenalty)
  }
  if (!Number.isFinite(best)) return 0

  const maximum =
    queryLower.length * (SCORE_MATCH + SCORE_BOUNDARY) +
    Math.max(0, queryLower.length - 1) * SCORE_CONSECUTIVE
  return clampScore(best / maximum)
}

function resolveBoundaryBonus(chars: readonly string[], index: number): number {
  if (index === 0) return SCORE_BOUNDARY
  const previous = chars[index - 1] ?? ''
  const current = chars[index] ?? ''
  if (/[/\\\s_.-]/u.test(previous)) return SCORE_BOUNDARY
  if (/\p{Ll}/u.test(previous) && /\p{Lu}/u.test(current)) return SCORE_CAMEL
  if (/\D/u.test(previous) && /\d/u.test(current)) return SCORE_CAMEL
  return 0
}

function clampScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0
  return Math.min(1, score)
}
