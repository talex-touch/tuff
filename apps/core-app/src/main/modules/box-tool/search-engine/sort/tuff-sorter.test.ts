import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { calculateSortScore, tuffSorter } from './tuff-sorter'

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
      id: 'app-chatapp',
      kind: 'app',
      title: '聊天应用',
      sourceId: 'app-provider'
    })

    const featureItem = createItem({
      id: 'feature-chatapp-tools',
      kind: 'feature',
      title: '聊天应用工具箱',
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

    const sorted = tuffSorter.sort(
      [featureItem, appItem],
      { text: '聊天应用' } as TuffQuery,
      signal
    )
    expect(sorted[0]?.id).toBe('app-chatapp')
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

  it('低置信 app fuzzy 命中不应压过 plugin token 命中', () => {
    const appItem = createItem({
      id: 'app-managed-client',
      kind: 'app',
      title: 'ManagedClient',
      sourceId: 'app-provider',
      matchResult: [{ start: 7, end: 10 }],
      matchSource: 'name-fuzzy'
    })

    const featureItem = createItem({
      id: 'feature-clipboard-history',
      kind: 'feature',
      title: '剪贴板历史记录',
      sourceId: 'plugin-features',
      searchTokens: ['clipboard', 'clipboard-history', 'clipb'],
      matchResult: [{ start: 0, end: '剪贴板历史记录'.length }],
      matchSource: 'token'
    })

    const sorted = tuffSorter.sort([appItem, featureItem], { text: 'clipb' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('feature-clipboard-history')
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

  it('补全命中的 item 应在其余打分相等时前置（B2 回归）', () => {
    const plainItem = createItem({
      id: 'feature-plain',
      kind: 'feature',
      title: 'Clipboard Manager',
      sourceId: 'plugin-features'
    })

    const completedItem = createItem({
      id: 'feature-completed',
      kind: 'feature',
      title: 'Clipboard Manager',
      sourceId: 'plugin-features'
    })
    completedItem.meta!.completion = {
      count: 5,
      lastCompleted: new Date().toISOString(),
      score: 50
    }

    // completedItem 放在输入第二位；两者其余打分因子完全相同，只有补全
    // boost 能把它移到前面。若 sorter 未消费 meta.completion（B2 缺陷），
    // 稳定排序会保留输入顺序、plainItem 在前，断言失败。
    const sorted = tuffSorter.sort(
      [plainItem, completedItem],
      { text: 'clip' } as TuffQuery,
      signal
    )
    expect(sorted[0]?.id).toBe('feature-completed')
  })

  it('无补全记录时不改变原有相对顺序（B2 控制组）', () => {
    const first = createItem({
      id: 'feature-first',
      kind: 'feature',
      title: 'Clipboard Manager',
      sourceId: 'plugin-features'
    })
    const second = createItem({
      id: 'feature-second',
      kind: 'feature',
      title: 'Clipboard Manager',
      sourceId: 'plugin-features'
    })

    const sorted = tuffSorter.sort([first, second], { text: 'clip' } as TuffQuery, signal)
    expect(sorted[0]?.id).toBe('feature-first')
  })
})

describe('manifest priority is a bias, not an override', () => {
  const signal = new AbortController().signal

  function priorityItem(id: string, priority: number): TuffItem {
    const item = createItem({
      id,
      kind: 'feature',
      title: 'Unrelated Feature',
      sourceId: 'plugin-provider'
    })
    return { ...item, meta: { ...item.meta, priority } }
  }

  async function rank(items: TuffItem[], text: string): Promise<string[]> {
    const query: TuffQuery = { text }
    const sorted = await tuffSorter.sort(items, query, signal)
    return sorted.map((entry) => entry.id)
  }

  it('一个声明超大 priority 的 feature 不能压过精确标题匹配的 app', async () => {
    const exactApp = createItem({
      id: 'app-safari',
      kind: 'app',
      title: 'Safari',
      sourceId: 'app-provider',
      searchTokens: ['safari'],
      matchResult: [{ start: 0, end: 6 }]
    })

    const ranked = await rank([priorityItem('greedy-feature', 100_000), exactApp], 'safari')

    expect(ranked[0]).toBe('app-safari')
  })

  it('钳制之后 priority 仍然能区分同类结果的先后', async () => {
    const ranked = await rank([priorityItem('low', 1), priorityItem('high', 200)], 'unrelated')

    expect(ranked).toEqual(['high', 'low'])
  })

  it('钳制在上限处饱和:超出上限的 priority 得到与上限完全相同的分数', () => {
    const atCap = calculateSortScore(priorityItem('at-cap', 500), 'unrelated')
    const overCap = calculateSortScore(priorityItem('way-over-cap', 9_999_999), 'unrelated')

    expect(overCap).toBe(atCap)
  })

  it('负 priority 不会把分数拖到上限之外', () => {
    const zero = calculateSortScore(priorityItem('zero', 0), 'unrelated')
    const negative = calculateSortScore(priorityItem('negative', -9_999_999), 'unrelated')

    expect(negative).toBe(zero)
  })
})

describe('files rank on their stem, below app and feature title matches', () => {
  const signal = new AbortController().signal

  function createFileItem(id: string, name: string, extension?: string): TuffItem {
    const item = createItem({ id, kind: 'file', title: name, sourceId: 'file-provider' })
    item.source = { type: 'file', id: 'file-provider', name: 'file-provider' }
    const dotIndex = name.lastIndexOf('.')
    const resolvedExtension = extension ?? (dotIndex > 0 ? name.slice(dotIndex + 1) : '')
    item.meta = {
      ...item.meta,
      file: { path: `/Users/demo/${name}`, extension: resolvedExtension.toLowerCase() }
    }
    return item
  }

  function createAppItem(id: string, title: string): TuffItem {
    return createItem({ id, kind: 'app', title, sourceId: 'app-provider' })
  }

  function rank(items: TuffItem[], text: string): string[] {
    return tuffSorter.sort(items, { text } as TuffQuery, signal).map((item) => item.id)
  }

  it('a file recalled only by its extension ranks below an app whose title contains the query', () => {
    // "key" is the .key extension: before, README.key split on "." into a word-prefix hit (500)
    // and outranked the substring app hit (300).
    const app = createAppItem('app-monkey-tools', 'Monkey Tools')
    const files = Array.from({ length: 12 }, (_, index) =>
      createFileItem(`file-${index}`, `deck-${index}.key`)
    )

    expect(rank([...files, app], 'key')[0]).toBe('app-monkey-tools')
  })

  it('a file whose stem starts with the query ranks below an app whose title contains it', () => {
    const app = createAppItem('app-xcode', 'Xcode')
    const file = createFileItem('file-code-review', 'code-review.md')

    expect(rank([file, app], 'code')).toEqual(['app-xcode', 'file-code-review'])
  })

  it('a file whose stem equals the query sits between an app title prefix and an app title substring', () => {
    const prefixApp = createAppItem('app-apple-notes', 'Apple Notes')
    const substringApp = createAppItem('app-keynotes', 'Keynotes Helper')
    const file = createFileItem('file-notes', 'notes.md')

    expect(rank([file, substringApp, prefixApp], 'notes')).toEqual([
      'app-apple-notes',
      'file-notes',
      'app-keynotes'
    ])
  })

  it('typing the full file name is still an exact match that beats an app title prefix', () => {
    const app = createAppItem('app-notes-md-editor', 'Notes.md Editor')
    const file = createFileItem('file-notes', 'notes.md')

    expect(rank([app, file], 'notes.md')).toEqual(['file-notes', 'app-notes-md-editor'])
  })

  it('a query that carries the extension matches the stem', () => {
    const stemMatch = createFileItem('file-notes', 'notes.md')
    const otherMarkdown = createFileItem('file-archive', 'archive.md')

    expect(rank([otherMarkdown, stemMatch], 'note.md')).toEqual(['file-notes', 'file-archive'])
    expect(calculateSortScore(stemMatch, 'note.md')).toBeGreaterThan(
      calculateSortScore(otherMarkdown, 'note.md')
    )
  })

  it('a dotted extension query counts as an extension hit, under any stem match', () => {
    const readme = createFileItem('file-readme', 'readme.md')
    const stemSubstring = createFileItem('file-cmd-notes', 'cmd-notes.txt')

    expect(calculateSortScore(readme, '.md')).toBe(calculateSortScore(readme, 'md'))
    expect(calculateSortScore(readme, '.md')).toBeLessThan(calculateSortScore(stemSubstring, 'md'))
    expect(calculateSortScore(readme, '.md')).toBeGreaterThan(
      calculateSortScore(createFileItem('file-unrelated', 'photo.png'), '.md')
    )
  })

  it('a file whose stem starts with the query still ranks above a typo-tolerant app hit', () => {
    const fuzzyApp = createItem({
      id: 'app-managed-client',
      kind: 'app',
      title: 'ManagedClient',
      sourceId: 'app-provider',
      matchResult: [{ start: 7, end: 10 }],
      matchSource: 'name-fuzzy'
    })
    const file = createFileItem('file-clipboard-notes', 'clipboard-notes.txt')

    expect(rank([fuzzyApp, file], 'clipb')).toEqual(['file-clipboard-notes', 'app-managed-client'])
  })

  it('a folder row without an extension matches on its whole name', () => {
    const folder = createItem({
      id: 'folder-downloads',
      kind: 'folder',
      title: 'Downloads',
      sourceId: 'windows-shell-file-provider'
    })
    const substringApp = createAppItem('app-loader', 'Bulk Downloader')

    expect(calculateSortScore(folder, 'downloads')).toBeGreaterThan(
      calculateSortScore(substringApp, 'downloads')
    )
    expect(calculateSortScore(folder, 'down')).toBeLessThan(
      calculateSortScore(createAppItem('app-downie', 'Downie'), 'down')
    )
  })

  /**
   * The ladder above, checked over a hundred seeded queries against a realistic corpus: real
   * app names, a few hundred files spread over common extensions, usage stats on a third of the
   * rows, and highlight ranges on half of the matched apps (the shape the app provider sends).
   * Queries are app-name prefixes, extensions and file-stem prefixes -- the three things that
   * used to bury an app under fifty files.
   */
  it('keeps apps above files across 100 random queries against a realistic corpus', () => {
    let seed = 0x5eed_0926
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const randomInt = (maxExclusive: number): number => Math.floor(random() * maxExclusive)
    const pick = <T>(values: readonly T[]): T => values[randomInt(values.length)]

    const appNames = [
      'Safari',
      'Google Chrome',
      'Visual Studio Code',
      'Xcode',
      'Terminal',
      'Finder',
      'Notes',
      'Apple Notes',
      'Keynote',
      'Pages',
      'Numbers',
      'Preview',
      'Photos',
      'Music',
      'Messages',
      'WeChat',
      'WebStorm',
      'Docker',
      'Discord',
      'Slack',
      'Zoom',
      'Figma',
      'Sketch',
      'Obsidian',
      'Notion',
      'Raycast',
      'Claude',
      'ChatGPT',
      'Cursor',
      'Ghostty',
      'iTerm',
      'Postman',
      'Photoshop',
      'Lightroom',
      'Final Cut Pro',
      'Logic Pro',
      'Keynote Remote',
      'PDF Expert',
      'Acrobat Reader',
      'Monkey Tools',
      'App Cleaner 8',
      'Bartender',
      'CleanMyMac',
      'Steam',
      'TestFlight',
      'Transmit',
      'Tower',
      'Typora',
      'MindNode',
      'Things',
      'Todoist',
      'Telegram'
    ]
    const stems = [
      'notes',
      'budget',
      'report',
      'readme',
      'index',
      'main',
      'app',
      'code-review',
      'todo',
      'weekly-report',
      'design-spec',
      'meeting-notes',
      'invoice',
      'photo',
      'screenshot',
      'presentation',
      'draft',
      'final',
      'archive',
      'backup',
      'config',
      'package',
      'test',
      'terminal-setup',
      'docker-compose',
      'chrome-profile',
      'slack-export',
      'zoom-recording',
      'figma-export',
      'xcode-notes',
      'safari-bookmarks',
      'music-list',
      'pages-draft'
    ]
    const extensions = [
      'md',
      'txt',
      'pdf',
      'key',
      'pages',
      'numbers',
      'doc',
      'docx',
      'xlsx',
      'png',
      'jpg',
      'ts',
      'js',
      'json',
      'py',
      'sh',
      'app',
      'zip',
      'mov',
      'mp3'
    ]

    const files: TuffItem[] = []
    for (let index = 0; index < 300; index += 1) {
      const stem = `${pick(stems)}${random() < 0.5 ? `-${randomInt(2030)}` : ''}`
      files.push(createFileItem(`file-${index}`, `${stem}.${pick(extensions)}`))
    }

    const usage = (): UsageStats => ({
      executeCount: randomInt(40),
      searchCount: randomInt(40),
      cancelCount: 0,
      lastExecuted: new Date().toISOString(),
      lastSearched: new Date().toISOString(),
      lastCancelled: null
    })

    const queries: string[] = []
    for (let index = 0; index < 100; index += 1) {
      const roll = random()
      if (roll < 0.4) {
        const word = pick(pick(appNames).toLowerCase().split(' '))
        queries.push(word.slice(0, Math.max(2, Math.min(word.length, 2 + randomInt(4)))))
      } else if (roll < 0.7) {
        queries.push(`${random() < 0.3 ? '.' : ''}${pick(extensions)}`)
      } else {
        const stem = pick(stems)
        queries.push(stem.slice(0, Math.max(2, Math.min(stem.length, 2 + randomInt(6)))))
      }
    }
    expect(queries).toHaveLength(100)

    const wordPrefix = (title: string, key: string): boolean =>
      title.startsWith(key) ||
      title
        .split(/[\s._/\\()[\]{}:+-]+/)
        .filter(Boolean)
        .some((word) => word.startsWith(key))

    for (const query of queries) {
      const key = query.toLowerCase()
      const items: TuffItem[] = []
      const appClass = new Map<string, 'prefix' | 'substring' | 'none'>()
      const fileClass = new Map<string, 'full' | 'stem-exact' | 'stem' | 'extension' | 'none'>()

      for (const [index, name] of appNames.entries()) {
        const item = createAppItem(`app-${index}`, name)
        const title = name.toLowerCase()
        const matchClass = title.includes(key)
          ? wordPrefix(title, key)
            ? 'prefix'
            : 'substring'
          : 'none'
        appClass.set(item.id, matchClass)
        if (matchClass !== 'none' && random() < 0.5) {
          const start = title.indexOf(key)
          item.meta!.extension = {
            ...item.meta!.extension,
            matchResult: [{ start, end: start + key.length }],
            source: 'name'
          }
        }
        if (random() < 0.33) item.meta!.usageStats = usage()
        items.push(item)
      }

      for (const file of files) {
        const item = { ...file, meta: { ...file.meta } } as TuffItem
        const title = item.render.basic!.title!.toLowerCase()
        const extension = item.meta!.file!.extension!
        const stem = title.slice(0, -(extension.length + 1))
        const extensionKey = key.replace(/^\./, '')
        const matchClass =
          title === key
            ? 'full'
            : stem === key
              ? 'stem-exact'
              : stem.includes(key)
                ? 'stem'
                : extension.startsWith(extensionKey)
                  ? 'extension'
                  : 'none'
        fileClass.set(item.id, matchClass)
        if (random() < 0.33) item.meta!.usageStats = usage()
        items.push(item)
      }

      const ranked = rank(items, query)
      const position = new Map(ranked.map((id, index) => [id, index]))
      const label = `query "${query}"`

      for (const [appId, matchClass] of appClass) {
        if (matchClass === 'none') continue
        for (const [fileId, fileMatch] of fileClass) {
          if (fileMatch === 'full') continue
          // An app title prefix beats every file short of its full name; an app title substring
          // beats every file short of an exact stem.
          if (matchClass === 'substring' && fileMatch === 'stem-exact') continue
          expect(position.get(appId), `${label}: app ${appId} vs file ${fileId}`).toBeLessThan(
            position.get(fileId)!
          )
        }
      }

      // Files that match by name outrank files that only match by extension.
      for (const [nameId, nameMatch] of fileClass) {
        if (nameMatch === 'none' || nameMatch === 'extension') continue
        for (const [extensionId, extensionMatch] of fileClass) {
          if (extensionMatch !== 'extension') continue
          expect(position.get(nameId), `${label}: file ${nameId} vs ${extensionId}`).toBeLessThan(
            position.get(extensionId)!
          )
        }
      }
    }
  })
})
