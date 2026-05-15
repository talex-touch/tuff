import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ProviderContext } from '../../search-engine/types'
import { TuffInputType, TuffItemBuilder, TuffSearchResultBuilder } from '@talex-touch/utils'
import { performance } from 'node:perf_hooks'
import { getLogger } from '@talex-touch/utils/common/logger'
import { t } from '../../../../utils/i18n-helper'

const mainWindowLog = getLogger('main-window-provider')
const MAIN_WINDOW_ACTION_TOKENS = [
  'show',
  'open',
  'display',
  'reveal',
  'focus',
  'activate',
  'bring up',
  'bring to front',
  '显示',
  '打开',
  '展示',
  '唤起',
  '呼出',
  '呼起',
  '激活',
  '前台'
]

const MAIN_WINDOW_OBJECT_TOKENS = [
  'main',
  'main window',
  'mainwindow',
  'main窗口',
  'window',
  'home',
  'home window',
  'homewindow',
  'homepage',
  'home page',
  'dashboard',
  'primary window',
  'app window',
  'application window',
  'tuff window',
  '主窗口',
  '主界面',
  '主页面',
  '主页',
  '首页',
  '主面板',
  '应用窗口',
  '程序窗口',
  '窗口'
]

const MAIN_WINDOW_PHRASE_TOKENS = [
  'show main',
  'show main window',
  'open main',
  'open main window',
  'display main window',
  'reveal main window',
  'focus main window',
  'activate main window',
  '显示主窗口',
  '打开主窗口',
  '展示主窗口',
  '唤起主窗口',
  '呼出主窗口',
  '回到主窗口',
  '打开 tuff',
  '显示 tuff',
  'tuff 主窗口'
]

const MAIN_WINDOW_SEARCH_TOKENS = Array.from(
  new Set([
    ...MAIN_WINDOW_ACTION_TOKENS,
    ...MAIN_WINDOW_OBJECT_TOKENS,
    ...MAIN_WINDOW_PHRASE_TOKENS
  ])
)

const MAIN_WINDOW_ACTION_ALIASES = new Set(
  MAIN_WINDOW_ACTION_TOKENS.map((token) => normalizeSearchToken(token))
)
const MAIN_WINDOW_OBJECT_ALIASES = new Set(
  MAIN_WINDOW_OBJECT_TOKENS.map((token) => normalizeSearchToken(token))
)
const MAIN_WINDOW_QUERY_ALIASES = new Set(
  MAIN_WINDOW_SEARCH_TOKENS.map((token) => normalizeSearchToken(token))
)

function normalizeSearchToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

export class MainWindowProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'main-window-provider'
  readonly type = 'system' as const
  readonly name = 'Main Window'
  readonly supportedInputTypes = [TuffInputType.Text]
  readonly priority = 'fast' as const
  readonly expectedDuration = 20

  private context: ProviderContext | null = null

  async onLoad(context: ProviderContext): Promise<void> {
    this.context = context
  }

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startTime = performance.now()
    if (signal.aborted) {
      return this.createEmptyResult(query, startTime)
    }

    const rawText = query.text?.trim() ?? ''
    if (!rawText || !this.isMainWindowQuery(rawText)) {
      return this.createEmptyResult(query, startTime)
    }

    const item = this.buildMainWindowItem(query)
    const duration = performance.now() - startTime

    return new TuffSearchResultBuilder(query)
      .setItems([item])
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name ?? this.id,
          duration,
          resultCount: 1,
          status: 'success'
        }
      ])
      .build()
  }

  async onExecute(_args: IExecuteArgs): Promise<IProviderActivate | null> {
    this.showMainWindow()
    return null
  }

  private isMainWindowQuery(rawText: string): boolean {
    if (!rawText) return false
    const normalizedQuery = normalizeSearchToken(rawText)
    return MAIN_WINDOW_QUERY_ALIASES.has(normalizedQuery)
  }

  private buildMainWindowItem(query: TuffQuery): TuffItem {
    const title = t('tray.showWindow')
    const subtitle = t('tray.tooltip')
    const matchResult = this.resolveTitleMatchRanges(title, query.text ?? '')

    return new TuffItemBuilder('main-window', this.type, this.id)
      .setKind('app')
      .setTitle(title)
      .setSubtitle(subtitle)
      .setIcon({
        type: 'url',
        value: 'https://tuff.tagzxia.com/favicon.ico'
      })
      .setActions([
        {
          id: 'show-main-window',
          type: 'open',
          label: title,
          primary: true
        }
      ])
      .setMeta({
        extension: {
          matchResult,
          searchTokens: MAIN_WINDOW_SEARCH_TOKENS
        }
      })
      .build()
  }

  private resolveTitleMatchRanges(
    title: string,
    rawText: string
  ): Array<{ start: number; end: number }> {
    const trimmedQuery = rawText.trim()
    if (!trimmedQuery) return []

    const directMatch = this.findTitleRange(title, trimmedQuery)
    if (directMatch) return [directMatch]

    const normalizedQuery = normalizeSearchToken(trimmedQuery)
    const fallbackNeedles = MAIN_WINDOW_ACTION_ALIASES.has(normalizedQuery)
      ? ['show', '显示', '打开']
      : MAIN_WINDOW_OBJECT_ALIASES.has(normalizedQuery)
        ? ['main window', '主窗口', 'main']
        : ['show main window', '显示主窗口', 'main window']

    for (const needle of fallbackNeedles) {
      const range = this.findTitleRange(title, needle)
      if (range) return [range]
    }

    return []
  }

  private findTitleRange(title: string, needle: string): { start: number; end: number } | null {
    const normalizedNeedle = needle.trim().toLowerCase()
    if (!normalizedNeedle) return null

    const start = title.toLowerCase().indexOf(normalizedNeedle)
    if (start < 0) return null
    return {
      start,
      end: start + normalizedNeedle.length
    }
  }

  private showMainWindow(): void {
    const mainWindow = this.context?.touchApp.window.window
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindowLog.warn('Main window not available')
      return
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }

  private createEmptyResult(query: TuffQuery, startedAt: number): TuffSearchResult {
    const duration = performance.now() - startedAt
    return new TuffSearchResultBuilder(query)
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name ?? this.id,
          duration,
          resultCount: 0,
          status: 'success'
        }
      ])
      .build()
  }
}

export const mainWindowProvider = new MainWindowProvider()
