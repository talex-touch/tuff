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
const MAIN_WINDOW_SEARCH_TOKENS = [
  'main',
  'main window',
  'mainwindow',
  'main窗口',
  'home',
  'home window',
  'homewindow',
  'homepage',
  'home page',
  'dashboard',
  'primary window',
  '主窗口',
  '主界面',
  '主页面',
  '主页',
  '首页',
  '主面板'
]

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
    return MAIN_WINDOW_QUERY_ALIASES.has(normalizeSearchToken(rawText))
  }

  private buildMainWindowItem(query: TuffQuery): TuffItem {
    const title = t('tray.showWindow')
    const subtitle = t('tray.tooltip')
    const normalizedQuery = (query.text ?? '').trim().toLowerCase()
    const titleLower = title.toLowerCase()
    const matchIndex = normalizedQuery ? titleLower.indexOf(normalizedQuery) : -1
    const matchResult =
      matchIndex >= 0
        ? [
            {
              start: matchIndex,
              end: matchIndex + normalizedQuery.length
            }
          ]
        : []

    return new TuffItemBuilder('main-window', this.type, this.id)
      .setKind('app')
      .setTitle(title)
      .setSubtitle(subtitle)
      .setIcon({
        type: 'class',
        value: 'ri:window-line'
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
