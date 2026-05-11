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
  recency?: number
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
    },
    scoring:
      input.recency === undefined
        ? undefined
        : {
            recency: input.recency
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
      title: 'Clipboard History',
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

  it('app 标题前缀命中应优先于中等频次 feature 可见标题命中', () => {
    const appItem = createItem({
      id: 'app-claude',
      kind: 'app',
      title: 'Claude',
      sourceId: 'app-provider'
    })

    const featureItem = createItem({
      id: 'feature-claude-helper',
      kind: 'feature',
      title: 'Claude Helper',
      sourceId: 'plugin-features',
      usageStats: {
        executeCount: 12,
        searchCount: 8,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: new Date().toISOString(),
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort([featureItem, appItem], { text: 'clau' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('app-claude')
  })

  it('中文 app 标题命中应优先于中等频次 plugin feature 可见标题命中', () => {
    const appItem = createItem({
      id: 'app-wechat',
      kind: 'app',
      title: '微信',
      sourceId: 'app-provider'
    })

    const featureItem = createItem({
      id: 'feature-wechat-tools',
      kind: 'feature',
      title: '微信工具箱',
      sourceId: 'plugin-features',
      usageStats: {
        executeCount: 12,
        searchCount: 8,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: new Date().toISOString(),
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort([featureItem, appItem], { text: '微信' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('app-wechat')
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

  it('app 标题前缀命中应优先于 plugin feature 的隐藏 token 命中', () => {
    const appItem = createItem({
      id: 'app-claude',
      kind: 'app',
      title: 'Claude',
      sourceId: 'app-provider'
    })

    const featureItem = createItem({
      id: 'feature-claude-chat',
      kind: 'feature',
      title: 'AI Chat',
      sourceId: 'plugin-features',
      searchTokens: ['claude', 'claude-chat', 'chat'],
      matchResult: [{ start: 0, end: 'AI Chat'.length }],
      matchSource: 'token',
      usageStats: {
        executeCount: 20,
        searchCount: 12,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: new Date().toISOString(),
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort([featureItem, appItem], { text: 'clau' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('app-claude')
  })

  it('app 标题子串命中也应优先于 plugin feature 的隐藏 token 命中', () => {
    const appItem = createItem({
      id: 'app-visual-studio-code',
      kind: 'app',
      title: 'Visual Studio Code',
      sourceId: 'app-provider'
    })

    const featureItem = createItem({
      id: 'feature-code-helper',
      kind: 'feature',
      title: 'Developer Assistant',
      sourceId: 'plugin-features',
      searchTokens: ['code', 'code-helper'],
      matchResult: [{ start: 0, end: 'Developer Assistant'.length }],
      matchSource: 'token',
      usageStats: {
        executeCount: 120,
        searchCount: 40,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: new Date().toISOString(),
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort([featureItem, appItem], { text: 'code' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('app-visual-studio-code')
  })

  it('app 标题单词前缀命中应优先于中等频次 plugin feature 可见标题命中', () => {
    const appItem = createItem({
      id: 'app-visual-studio-code',
      kind: 'app',
      title: 'Visual Studio Code',
      sourceId: 'app-provider'
    })

    const featureItem = createItem({
      id: 'feature-code-snippets',
      kind: 'feature',
      title: 'Code Snippets',
      sourceId: 'plugin-features',
      usageStats: {
        executeCount: 12,
        searchCount: 8,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: new Date().toISOString(),
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort([featureItem, appItem], { text: 'code' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('app-visual-studio-code')
  })

  it('app 精确别名 token 命中应优先于中等频次 plugin feature 可见标题前缀命中', () => {
    const appItem = createItem({
      id: 'app-visual-studio-code',
      kind: 'app',
      title: 'Visual Studio Code',
      sourceId: 'app-provider',
      searchTokens: ['vsc', 'vscode', 'visual-studio-code']
    })

    const featureItem = createItem({
      id: 'feature-vsc-snippets',
      kind: 'feature',
      title: 'VSC Snippets',
      sourceId: 'plugin-features',
      usageStats: {
        executeCount: 12,
        searchCount: 8,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: new Date().toISOString(),
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort([featureItem, appItem], { text: 'vsc' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('app-visual-studio-code')
  })

  it('app 别名 token 前缀命中应优先于中等频次 plugin feature 可见标题前缀命中', () => {
    const appItem = createItem({
      id: 'app-visual-studio-code',
      kind: 'app',
      title: 'Visual Studio Code',
      sourceId: 'app-provider',
      searchTokens: ['vscode', 'visual-studio-code']
    })

    const featureItem = createItem({
      id: 'feature-vscod-tools',
      kind: 'feature',
      title: 'Vscod Tools',
      sourceId: 'plugin-features',
      usageStats: {
        executeCount: 12,
        searchCount: 8,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: new Date().toISOString(),
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort([featureItem, appItem], { text: 'vscod' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('app-visual-studio-code')
  })

  it('极高频 plugin feature 可见标题前缀命中仍可优先于 app 精确别名 token 命中', () => {
    const appItem = createItem({
      id: 'app-visual-studio-code',
      kind: 'app',
      title: 'Visual Studio Code',
      sourceId: 'app-provider',
      searchTokens: ['vsc', 'vscode', 'visual-studio-code']
    })

    const featureItem = createItem({
      id: 'feature-vsc-snippets',
      kind: 'feature',
      title: 'VSC Snippets',
      sourceId: 'plugin-features',
      usageStats: {
        executeCount: 10000,
        searchCount: 5000,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: new Date().toISOString(),
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort([appItem, featureItem], { text: 'vsc' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('feature-vsc-snippets')
  })

  it('极高频 plugin feature 隐藏 token 召回不应压过 app 标题命中', () => {
    const appItem = createItem({
      id: 'app-linear',
      kind: 'app',
      title: 'Linear',
      sourceId: 'app-provider'
    })

    const featureItem = createItem({
      id: 'feature-linear-helper',
      kind: 'feature',
      title: 'Issue Assistant',
      sourceId: 'plugin-features',
      searchTokens: ['linear', 'linear-helper'],
      matchResult: [{ start: 0, end: 'Issue Assistant'.length }],
      matchSource: 'token',
      usageStats: {
        executeCount: 10000,
        searchCount: 5000,
        cancelCount: 0,
        lastExecuted: new Date().toISOString(),
        lastSearched: new Date().toISOString(),
        lastCancelled: null
      }
    })

    const sorted = tuffSorter.sort([featureItem, appItem], { text: 'linear' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('app-linear')
  })

  it('极高 recency 的 plugin feature 隐藏 token 召回不应压过 app 标题命中', () => {
    const appItem = createItem({
      id: 'app-raycast',
      kind: 'app',
      title: 'Raycast',
      sourceId: 'app-provider'
    })

    const featureItem = createItem({
      id: 'feature-raycast-helper',
      kind: 'feature',
      title: 'Launcher Assistant',
      sourceId: 'plugin-features',
      searchTokens: ['raycast', 'raycast-helper'],
      matchResult: [{ start: 0, end: 'Launcher Assistant'.length }],
      matchSource: 'token',
      recency: 10000
    })

    const sorted = tuffSorter.sort([featureItem, appItem], { text: 'raycast' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('app-raycast')
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
