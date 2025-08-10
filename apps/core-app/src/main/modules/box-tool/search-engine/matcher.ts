import PinyinMatch from 'pinyin-match'
import { TuffItem, TuffQuery } from '@talex-touch/utils'

function check(keyword: string, appName: string) {
  return PinyinMatch.match(appName, keyword)
}

function applyMatch(item: TuffItem, keyword: string): TuffItem | null {
  if (!keyword) return item

  const resByName = check(keyword, item.title)
  if (resByName !== false) {
    return {
      ...item,
      scoring: { ...item.scoring, match: resByName, matchedByName: true }
    }
  }

  const resByDesc = check(keyword, item.subTitle)
  if (resByDesc !== false) {
    return {
      ...item,
      scoring: { ...item.scoring, match: resByDesc, matchedByDesc: true }
    }
  }

  if (item.id) {
    const resById = check(keyword, item.id)
    if (resById !== false) {
      return {
        ...item,
        scoring: { ...item.scoring, match: resById, matchedById: true }
      }
    }
  }

  // You can add more matching logic here, for example, by keywords, etc.

  return null
}

export function applyMatching(items: TuffItem[], query: TuffQuery): TuffItem[] {
  const matchedItems: TuffItem[] = []
  for (const item of items) {
    const matchedItem = applyMatch(item, query.text)
    if (matchedItem) {
      matchedItems.push(matchedItem)
    }
  }
  return matchedItems
}