import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { tuffSorter } from './tuff-sorter'

type UsageStats = NonNullable<NonNullable<TuffItem['meta']>['usageStats']>

function createItem(input: {
  id: string
  kind: string
  title: string
  sourceId: string
  searchTokens?: string[]
  matchResult?: Array<{ start: number; end: number }>
  matchSource?: string
  usageStats?: UsageStats
}): TuffItem {
  return {
    id: input.id,
    kind: input.kind,
    source: {
      type: 'system',
      id: input.sourceId,
      name: input.sourceId
    },
    render: {
      mode: 'default',
      basic: {
        title: input.title
      }
    },
    meta: {
      extension: {
        searchTokens: input.searchTokens,
        matchResult: input.matchResult,
        source: input.matchSource
      },
      usageStats: input.usageStats
    }
  }
}

describe('tuff-sorter ranking strategy', () => {
  const signal = new AbortController().signal

  it('匹配更强的 feature 不应被 app 类型强制压制', () => {
    const appItem = createItem({
      id: 'app-photo-booth',
      kind: 'app',
      title: 'Photo Booth',
      sourceId: 'app-provider'
    })

    const featureItem = createItem({
      id: 'feature-clipboard-history',
      kind: 'feature',
      title: '剪贴板历史记录',
      sourceId: 'plugin-features',
      searchTokens: ['clipboard', 'clipboard-history']
    })

    const sorted = tuffSorter.sort([appItem, featureItem], { text: 'clipbo' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('feature-clipboard-history')
  })

  it('匹配接近时，高使用频次 feature 应自动前置', () => {
    const appItem = createItem({
      id: 'app-clipboard-tool',
      kind: 'app',
      title: 'Clipboard Tool',
      sourceId: 'app-provider',
      searchTokens: ['clipboard-tool']
    })

    const featureItem = createItem({
      id: 'feature-clipboard-history',
      kind: 'feature',
      title: '剪贴板历史记录',
      sourceId: 'plugin-features',
      searchTokens: ['clipboard-history'],
      usageStats: {
        executeCount: 32,
        searchCount: 18,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: new Date().toISOString(),
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort(
      [appItem, featureItem],
      { text: 'clipboard' } as TuffQuery,
      signal
    )
    expect(sorted[0]?.id).toBe('feature-clipboard-history')
  })

  it('匹配差距明显时仍以匹配分为主', () => {
    const appItem = createItem({
      id: 'app-clipboard',
      kind: 'app',
      title: 'clipboard',
      sourceId: 'app-provider'
    })

    const featureItem = createItem({
      id: 'feature-clipboard-history',
      kind: 'feature',
      title: '剪贴板历史记录',
      sourceId: 'plugin-features',
      searchTokens: ['clipboard-history'],
      usageStats: {
        executeCount: 260,
        searchCount: 0,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: null,
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort(
      [featureItem, appItem],
      { text: 'clipboard' } as TuffQuery,
      signal
    )
    expect(sorted[0]?.id).toBe('app-clipboard')
  })

  it('别名/tag 伪高亮不应压过真实标题命中', () => {
    const aliasMatchedItem = createItem({
      id: 'app-erase-assistant',
      kind: 'app',
      title: 'Erase Assistant',
      sourceId: 'app-provider',
      matchSource: 'tag',
      matchResult: [{ start: 0, end: 7 }]
    })

    const directTitleMatchedItem = createItem({
      id: 'app-cleaner',
      kind: 'app',
      title: 'App Cleaner 8',
      sourceId: 'app-provider',
      matchSource: 'name',
      matchResult: [{ start: 4, end: 11 }]
    })

    const sorted = tuffSorter.sort(
      [aliasMatchedItem, directTitleMatchedItem],
      {
        text: 'cleaner'
      } as TuffQuery,
      signal
    )
    expect(sorted[0]?.id).toBe('app-cleaner')
  })
})
