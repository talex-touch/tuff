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

interface WindowsShellEntry {
  id: string
  target: string
  titleKey: string
  subtitleKey: string
  icon: string
  aliases: string[]
}

interface WindowsShellEntryMeta {
  id: string
  target: string
}

const windowsShellFileLog = getLogger('windows-shell-file-provider')
const CJK_PATTERN = /[\u3400-\u9fff]/

const WINDOWS_SHELL_ENTRIES: WindowsShellEntry[] = [
  {
    id: 'this-pc',
    target: 'shell:MyComputerFolder',
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
    titleKey: 'corebox.windowsShell.recycleBin.title',
    subtitleKey: 'corebox.windowsShell.recycleBin.subtitle',
    icon: 'i-ri-delete-bin-6-line',
    aliases: ['回收站', '垃圾桶', 'recycle', 'recycle bin', 'recyclebin', 'trash', 'huishouzhan']
  },
  {
    id: 'network',
    target: 'shell:NetworkPlacesFolder',
    titleKey: 'corebox.windowsShell.network.title',
    subtitleKey: 'corebox.windowsShell.network.subtitle',
    icon: 'i-ri-router-line',
    aliases: ['网络', '网上邻居', 'network', 'network places', 'wangluo']
  },
  {
    id: 'control-panel',
    target: 'shell:ControlPanelFolder',
    titleKey: 'corebox.windowsShell.controlPanel.title',
    subtitleKey: 'corebox.windowsShell.controlPanel.subtitle',
    icon: 'i-ri-settings-3-line',
    aliases: ['控制面板', '控制台', 'control panel', 'controlpanel', 'settings', 'kongzhimianban']
  },
  {
    id: 'user-folder',
    target: 'shell:Profile',
    titleKey: 'corebox.windowsShell.userFolder.title',
    subtitleKey: 'corebox.windowsShell.userFolder.subtitle',
    icon: 'i-ri-user-3-line',
    aliases: ['用户文件夹', '用户目录', '个人文件夹', 'user folder', 'profile', 'home', 'yonghu']
  },
  {
    id: 'desktop',
    target: 'shell:Desktop',
    titleKey: 'corebox.windowsShell.desktop.title',
    subtitleKey: 'corebox.windowsShell.desktop.subtitle',
    icon: 'i-ri-layout-grid-line',
    aliases: ['桌面', 'desktop', 'zhuomian']
  },
  {
    id: 'downloads',
    target: 'shell:Downloads',
    titleKey: 'corebox.windowsShell.downloads.title',
    subtitleKey: 'corebox.windowsShell.downloads.subtitle',
    icon: 'i-ri-download-2-line',
    aliases: ['下载', '下载文件夹', 'downloads', 'download', 'xiazai']
  },
  {
    id: 'documents',
    target: 'shell:Personal',
    titleKey: 'corebox.windowsShell.documents.title',
    subtitleKey: 'corebox.windowsShell.documents.subtitle',
    icon: 'i-ri-file-text-line',
    aliases: ['文档', '我的文档', 'documents', 'document', 'docs', 'wendang']
  },
  {
    id: 'pictures',
    target: 'shell:My Pictures',
    titleKey: 'corebox.windowsShell.pictures.title',
    subtitleKey: 'corebox.windowsShell.pictures.subtitle',
    icon: 'i-ri-image-line',
    aliases: ['图片', '照片', '我的图片', 'pictures', 'picture', 'photos', 'tupian']
  },
  {
    id: 'music',
    target: 'shell:My Music',
    titleKey: 'corebox.windowsShell.music.title',
    subtitleKey: 'corebox.windowsShell.music.subtitle',
    icon: 'i-ri-music-2-line',
    aliases: ['音乐', '我的音乐', 'music', 'audio', 'yinle']
  },
  {
    id: 'videos',
    target: 'shell:My Video',
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

    const items = this.matchEntries(rawText).map((entry) => this.buildEntryItem(entry))
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

  private matchEntries(rawText: string): WindowsShellEntry[] {
    const normalizedQuery = normalizeShellQuery(rawText)
    if (!normalizedQuery) return []

    return WINDOWS_SHELL_ENTRIES.filter((entry) =>
      entry.aliases.some((alias) => {
        const normalizedAlias = normalizeShellQuery(alias)
        const allowsPartial =
          normalizedQuery.length >= 3 ||
          (normalizedQuery.length >= 2 && CJK_PATTERN.test(normalizedQuery))
        return (
          normalizedAlias === normalizedQuery ||
          (allowsPartial &&
            (normalizedAlias.includes(normalizedQuery) ||
              normalizedQuery.includes(normalizedAlias)))
        )
      })
    )
  }

  private buildEntryItem(entry: WindowsShellEntry): TuffItem {
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
          searchTokens: entry.aliases,
          windowsShellEntry: {
            id: entry.id,
            target: entry.target
          }
        }
      })
      .setFinalScore(0.95)
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
