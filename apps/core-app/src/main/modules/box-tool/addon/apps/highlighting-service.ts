import { fuzzyMatch, indicesToRanges } from '@talex-touch/utils/search/fuzzy-match'
import { match as pinyinMatch } from 'pinyin-pro'

export interface Range {
  start: number
  end: number // 右开 [start, end)
}

/**
 * Converts an array of matching indices to an array of start/end ranges for highlighting.
 * e.g., [0, 1, 4, 5, 6] -> [{ start: 0, end: 2 }, { start: 4, end: 7 }]
 */
function convertIndicesToRanges(indices: number[]): Range[] {
  if (!indices?.length) return []
  const arr = Array.from(new Set(indices)).sort((a, b) => a - b) // 去重 + 拷贝 + 排序

  const ranges: Range[] = []
  let start = arr[0]
  let prev = arr[0]

  for (let i = 1; i < arr.length; i++) {
    const x = arr[i]
    if (x === prev + 1) {
      prev = x // 连续，延长
    } else {
      ranges.push({ start, end: prev + 1 }) // 右开
      start = prev = x
    }
  }
  ranges.push({ start, end: prev + 1 })
  return ranges
}

/**
 * 缩写匹配算法
 * 返回每个首字母的 Range
 * e.g., matchAcronym("visual studio code", "vsc") -> [{start: 0, end: 1}, {start: 7, end: 8}, {start: 14, end: 15}]
 */
function matchAcronym(text: string, query: string): Range[] | null {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  const words = lowerText.split(/[\s-]+/).filter(Boolean) // 分割单词并去除空字符串
  if (words.length === 0 || lowerQuery.length === 0) return null

  const ranges: Range[] = []
  let textCurrentIndex = 0 // 用于在原始文本中查找单词的起始位置
  let queryCharIndex = 0

  for (let i = 0; i < words.length && queryCharIndex < lowerQuery.length; i++) {
    const word = words[i]
    if (word.startsWith(lowerQuery[queryCharIndex])) {
      const wordStartIndex = lowerText.indexOf(word, textCurrentIndex)
      if (wordStartIndex !== -1) {
        ranges.push({ start: wordStartIndex, end: wordStartIndex + 1 }) // 匹配到首字母
        queryCharIndex++
        textCurrentIndex = wordStartIndex + word.length // 更新下一个单词的查找起始位置
      }
    } else {
      textCurrentIndex = lowerText.indexOf(word, textCurrentIndex) + word.length // 跳过不匹配的单词
    }
    // 如果当前单词不匹配，且query还有字符，需要重置textCurrentIndex到下一个单词的开始
    if (queryCharIndex < lowerQuery.length && !word.startsWith(lowerQuery[queryCharIndex - 1])) {
      textCurrentIndex = lowerText.indexOf(words[i + 1], textCurrentIndex) // 尝试找到下一个单词的起始
      if (textCurrentIndex === -1) textCurrentIndex = lowerText.length // 如果没有下一个单词，设置为文本末尾
    }
  }

  return ranges.length === lowerQuery.length ? ranges : null
}

/**
 * 核心高亮计算函数
 * @param text 要在其中搜索的完整文本 (e.g., "Visual Studio Code")
 * @param query 用户的搜索词 (e.g., "vsc")
 * @param enableFuzzy 是否启用模糊匹配 (default: true)
 * @returns Range[] | null 返回高亮范围数组，如果没有匹配则返回 null
 */
export function calculateHighlights(
  text: string,
  query: string,
  enableFuzzy = true
): Range[] | null {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // 1. 精确/子串匹配 (最高优先级)
  const exactMatches: Range[] = []
  const queryParts = lowerQuery.split(/\s+/).filter(Boolean)

  let allPartsMatched = true
  let currentTextIndex = 0

  for (const part of queryParts) {
    const index = lowerText.indexOf(part, currentTextIndex)
    if (index !== -1) {
      exactMatches.push({ start: index, end: index + part.length })
      currentTextIndex = index + part.length
    } else {
      allPartsMatched = false
      break
    }
  }

  if (allPartsMatched && exactMatches.length > 0) {
    return exactMatches
  }

  // 如果整个查询作为连续子串匹配
  const fullQueryIndex = lowerText.indexOf(lowerQuery.replace(/\s+/g, ''))
  if (fullQueryIndex !== -1) {
    return [{ start: fullQueryIndex, end: fullQueryIndex + lowerQuery.replace(/\s+/g, '').length }]
  }

  // 2. 缩写匹配 (e.g., "vsc" in "visual studio code")
  const acronymRanges = matchAcronym(text, query)
  if (acronymRanges) {
    return acronymRanges
  }

  // 3. 拼音匹配
  if (/^[a-z]+$/i.test(lowerQuery)) {
    const pinyinResult = pinyinMatch(text, query)
    if (pinyinResult && pinyinResult.length > 0) {
      return convertIndicesToRanges(pinyinResult)
    }
  }

  // 4. 模糊匹配 (typo tolerance, e.g., "helol" -> "hello")
  if (enableFuzzy && lowerQuery.length >= 2) {
    const fuzzyResult = fuzzyMatch(text, query, 2)
    if (fuzzyResult.matched && fuzzyResult.score >= 0.4) {
      return indicesToRanges(fuzzyResult.matchedIndices)
    }
  }

  return null
}

/**
 * 计算模糊匹配的高亮范围
 * @param text 目标文本
 * @param query 查询文本
 * @param maxErrors 最大允许错误数
 * @returns 匹配结果，包含分数和高亮范围
 */
export function calculateFuzzyHighlights(
  text: string,
  query: string,
  maxErrors = 2
): { score: number; ranges: Range[] } | null {
  const result = fuzzyMatch(text, query, maxErrors)
  if (!result.matched) return null

  return {
    score: result.score,
    ranges: indicesToRanges(result.matchedIndices)
  }
}
