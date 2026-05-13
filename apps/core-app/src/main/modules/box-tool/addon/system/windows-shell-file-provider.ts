import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ProviderContext } from '../../search-engine/types'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { TuffInputType, TuffItemBuilder, TuffSearchResultBuilder } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { spawnSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { i18nMsg } from '@talex-touch/utils/i18n'
import { pinyin } from 'pinyin-pro'
import { calculateHighlights, type Range } from '../apps/highlighting-service'

interface WindowsShellEntry {
  id: string
  target: string
  title: string
  titleKey: string
  subtitleKey: string
  icon: string
  aliases: string[]
}

interface WindowsShellMatch {
  entry: WindowsShellEntry
  highlights: Range[]
  score: number
}

interface WindowsShellEntryMeta {
  id: string
  target: string
}

const windowsShellFileLog = getLogger('windows-shell-file-provider')
const CJK_PATTERN = /[\u3400-\u9fff]/
const PINYIN_PARTICLE_PATTERN = /[的之]/g

const WINDOWS_SHELL_ENTRIES: WindowsShellEntry[] = [
  {
    id: 'this-pc',
    target: 'shell:MyComputerFolder',
    title: '此电脑',
    titleKey: 'corebox.windowsShell.thisPc.title',
    subtitleKey: 'corebox.windowsShell.thisPc.subtitle',
    icon: 'i-ri-computer-line',
    aliases: [
      '此电脑',
      '电脑',
      '我的电脑',
      '计算机',
      'this pc',
      'thispc',
      'pc',
      'my computer',
      'computer'
    ]
  },
  {
    id: 'recycle-bin',
    target: 'shell:RecycleBinFolder',
    title: '回收站',
    titleKey: 'corebox.windowsShell.recycleBin.title',
    subtitleKey: 'corebox.windowsShell.recycleBin.subtitle',
    icon: 'i-ri-delete-bin-6-line',
    aliases: ['回收站', '垃圾桶', 'recycle', 'recycle bin', 'recyclebin', 'trash', 'huishouzhan']
  },
  {
    id: 'network',
    target: 'shell:NetworkPlacesFolder',
    title: '网络',
    titleKey: 'corebox.windowsShell.network.title',
    subtitleKey: 'corebox.windowsShell.network.subtitle',
    icon: 'i-ri-router-line',
    aliases: ['网络', '网上邻居', 'network', 'network places', 'wangluo']
  },
  {
    id: 'control-panel',
    target: 'shell:ControlPanelFolder',
    title: '控制面板',
    titleKey: 'corebox.windowsShell.controlPanel.title',
    subtitleKey: 'corebox.windowsShell.controlPanel.subtitle',
    icon: 'i-ri-settings-3-line',
    aliases: ['控制面板', '控制台', 'control panel', 'controlpanel', 'settings', 'kongzhimianban']
  },
  {
    id: 'user-folder',
    target: 'shell:Profile',
    title: '用户文件夹',
    titleKey: 'corebox.windowsShell.userFolder.title',
    subtitleKey: 'corebox.windowsShell.userFolder.subtitle',
    icon: 'i-ri-user-3-line',
    aliases: ['用户文件夹', '用户目录', '个人文件夹', 'user folder', 'profile', 'home', 'yonghu']
  },
  {
    id: 'desktop',
    target: 'shell:Desktop',
    title: '桌面',
    titleKey: 'corebox.windowsShell.desktop.title',
    subtitleKey: 'corebox.windowsShell.desktop.subtitle',
    icon: 'i-ri-layout-grid-line',
    aliases: ['桌面', 'desktop', 'zhuomian']
  },
  {
    id: 'downloads',
    target: 'shell:Downloads',
    title: '下载',
    titleKey: 'corebox.windowsShell.downloads.title',
    subtitleKey: 'corebox.windowsShell.downloads.subtitle',
    icon: 'i-ri-download-2-line',
    aliases: ['下载', '下载文件夹', 'downloads', 'download', 'xiazai']
  },
  {
    id: 'documents',
    target: 'shell:Personal',
    title: '文档',
    titleKey: 'corebox.windowsShell.documents.title',
    subtitleKey: 'corebox.windowsShell.documents.subtitle',
    icon: 'i-ri-file-text-line',
    aliases: ['文档', '我的文档', 'documents', 'document', 'docs', 'wendang']
  },
  {
    id: 'pictures',
    target: 'shell:My Pictures',
    title: '图片',
    titleKey: 'corebox.windowsShell.pictures.title',
    subtitleKey: 'corebox.windowsShell.pictures.subtitle',
    icon: 'i-ri-image-line',
    aliases: ['图片', '照片', '我的图片', 'pictures', 'picture', 'photos', 'tupian']
  },
  {
    id: 'music',
    target: 'shell:My Music',
    title: '音乐',
    titleKey: 'corebox.windowsShell.music.title',
    subtitleKey: 'corebox.windowsShell.music.subtitle',
    icon: 'i-ri-music-2-line',
    aliases: ['音乐', '我的音乐', 'music', 'audio', 'yinle']
  },
  {
    id: 'videos',
    target: 'shell:My Video',
    title: '视频',
    titleKey: 'corebox.windowsShell.videos.title',
    subtitleKey: 'corebox.windowsShell.videos.subtitle',
    icon: 'i-ri-video-line',
    aliases: ['视频', '影片', '我的视频', 'videos', 'video', 'movies', 'shipin']
  }
]

function normalizeShellQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

function resolvePinyinTokens(value: string): string[] {
  if (!CJK_PATTERN.test(value)) return []

  const values = [value, value.replace(PINYIN_PARTICLE_PATTERN, '')].filter(Boolean)
  const tokens = new Set<string>()

  for (const item of values) {
    tokens.add(pinyin(item, { toneType: 'none' }).replace(/\s/g, '').toLowerCase())
    tokens.add(
      pinyin(item, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '').toLowerCase()
    )
  }

  return Array.from(tokens).filter(Boolean)
}

function getWindowsShellEntryMeta(item: TuffItem): WindowsShellEntryMeta | null {
  const extension = item.meta?.extension
  if (!extension || typeof extension !== 'object') return null

  const shellEntry = (extension as { windowsShellEntry?: unknown }).windowsShellEntry
  if (!shellEntry || typeof shellEntry !== 'object') return null

  const meta = shellEntry as Partial<WindowsShellEntryMeta>
  if (typeof meta.id !== 'string' || typeof meta.target !== 'string') {
    return null
  }

  return {
    id: meta.id,
    target: meta.target
  }
}

export class WindowsShellFileProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'windows-shell-file-provider'
  readonly type = 'file' as const
  readonly name = 'Windows Shell File Entries'
  readonly supportedInputTypes = [TuffInputType.Text]
  readonly priority = 'fast' as const
  readonly expectedDuration = 15

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startTime = performance.now()
    if (process.platform !== 'win32' || signal.aborted) {
      return this.createEmptyResult(query, startTime)
    }

    const rawText = query.text?.trim() ?? ''
    if (!rawText) {
      return this.createEmptyResult(query, startTime)
    }

    const items = this.matchEntries(rawText).map((match) => this.buildEntryItem(match))
    const duration = performance.now() - startTime

    return new TuffSearchResultBuilder(query)
      .setItems(items)
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name,
          duration,
          resultCount: items.length,
          status: 'success'
        }
      ])
      .build()
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const meta = getWindowsShellEntryMeta(args.item)
    if (!meta) {
      windowsShellFileLog.warn('Windows shell entry metadata is missing')
      return null
    }

    try {
      const child = spawnSafe('explorer.exe', [meta.target], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      child.unref()
    } catch (error) {
      windowsShellFileLog.warn('Failed to open Windows shell entry', {
        error,
        meta
      })
    }

    return null
  }

  private matchEntries(rawText: string): WindowsShellMatch[] {
    const normalizedQuery = normalizeShellQuery(rawText)
    if (!normalizedQuery) return []

    return WINDOWS_SHELL_ENTRIES.map((entry) => this.matchEntry(entry, rawText, normalizedQuery))
      .filter((match): match is WindowsShellMatch => Boolean(match))
      .sort((left, right) => right.score - left.score)
  }

  private matchEntry(
    entry: WindowsShellEntry,
    rawText: string,
    normalizedQuery: string
  ): WindowsShellMatch | null {
    const titleHighlights = calculateHighlights(entry.title, rawText, false)
    if (titleHighlights?.length) {
      return {
        entry,
        highlights: titleHighlights,
        score: 0.98
      }
    }

    const titlePinyinTokens = resolvePinyinTokens(entry.title)
    const matchedTitlePinyin = titlePinyinTokens.some(
      (token) => token === normalizedQuery || token.includes(normalizedQuery)
    )
    if (matchedTitlePinyin) {
      return {
        entry,
        highlights: [{ start: 0, end: entry.title.length }],
        score: 0.9
      }
    }

    const aliasMatched = entry.aliases.some((alias) => this.matchesAlias(alias, normalizedQuery))
    if (!aliasMatched) {
      return null
    }

    return {
      entry,
      highlights: [],
      score: 0.8
    }
  }

  private matchesAlias(alias: string, normalizedQuery: string): boolean {
    const normalizedAlias = normalizeShellQuery(alias)
    const allowsPartial =
      normalizedQuery.length >= 3 ||
      (normalizedQuery.length >= 2 && CJK_PATTERN.test(normalizedQuery))

    if (
      normalizedAlias === normalizedQuery ||
      (allowsPartial &&
        (normalizedAlias.includes(normalizedQuery) || normalizedQuery.includes(normalizedAlias)))
    ) {
      return true
    }

    return resolvePinyinTokens(alias).some(
      (token) => token === normalizedQuery || token.includes(normalizedQuery)
    )
  }

  private buildEntryItem(match: WindowsShellMatch): TuffItem {
    const { entry, highlights, score } = match

    return new TuffItemBuilder(`${this.id}:${entry.id}`, this.type, this.id)
      .setKind('folder')
      .setTitle(i18nMsg(entry.titleKey))
      .setSubtitle(i18nMsg(entry.subtitleKey))
      .setIcon({
        type: 'class',
        value: entry.icon
      })
      .setActions([
        {
          id: 'open-windows-shell-entry',
          type: 'open',
          label: i18nMsg('corebox.windowsShell.open'),
          primary: true,
          payload: {
            target: entry.target
          }
        }
      ])
      .setMeta({
        extension: {
          matchResult: highlights,
          searchTokens: entry.aliases,
          windowsShellEntry: {
            id: entry.id,
            target: entry.target
          }
        }
      })
      .setFinalScore(score)
      .build()
  }

  private createEmptyResult(query: TuffQuery, startedAt: number): TuffSearchResult {
    const duration = performance.now() - startedAt
    return new TuffSearchResultBuilder(query)
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name,
          duration,
          resultCount: 0,
          status: 'success'
        }
      ])
      .build()
  }
}

export const windowsShellFileProvider = new WindowsShellFileProvider()
