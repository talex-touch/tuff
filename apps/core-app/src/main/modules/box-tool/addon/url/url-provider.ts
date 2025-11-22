import type { IExecuteArgs, IProviderActivate, ISearchProvider, TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import type { ProviderContext } from '../../search-engine/types'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { TuffInputType, TuffItemBuilder, TuffSearchResultBuilder } from '@talex-touch/utils'
import { appScanner } from '../apps/app-scanner'

/**
 * URL Provider
 * 检测URL输入并聚合所有可用浏览器,提供"用XX打开链接"选项
 */
class URLProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'url-provider'
  readonly name = 'URL Actions'
  readonly type = 'system' as const
  readonly icon = '🔗'
  readonly description = 'Open URLs with installed browsers'
  readonly supportedInputTypes = [TuffInputType.Text]

  private readonly URL_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i

  async onSearch(query: TuffQuery): Promise<TuffSearchResult> {
    const text = query.text.trim()

    // 检测是否为URL
    if (!this.isURL(text)) {
      return new TuffSearchResultBuilder(query).build()
    }

    const normalizedURL = this.normalizeURL(text)

    // 获取所有已安装的浏览器
    const browsers = await this.getInstalledBrowsers()

    if (browsers.length === 0) {
      return new TuffSearchResultBuilder(query).build()
    }

    // 为每个浏览器创建一个打开链接的action
    const items: TuffItem[] = browsers.map((browser, index) => {
      return new TuffItemBuilder(`${this.id}:${browser.id}:${normalizedURL}`)
        .setTitle(`用 ${browser.name} 打开`)
        .setSubtitle(normalizedURL)
        .setIcon({ type: 'emoji', value: browser.icon || '🌐' })
        .setSource(this.type, this.id, this.name)
        .setMeta({
          web: {
            url: normalizedURL,
          },
          app: {
            path: browser.path,
            // bundleId: browser.bundleId, // TuffMeta.app might not have bundleId, check definition if needed, but path is standard
          },
          raw: {
            browserBundleId: browser.bundleId,
            actionType: 'open_url',
          },
        })
        .setScoring({
          final: 1000 - index, // 按顺序降权,确保浏览器聚合在前
          match: 1000 - index,
          base: 0,
          recency: 0,
          frequency: 0,
        })
        .build()
    })

    return new TuffSearchResultBuilder(query).setItems(items).build()
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const { item } = args
    const url = item.meta?.web?.url
    const browserPath = item.meta?.app?.path

    if (!url || !browserPath) {
      console.error('[URLProvider] Missing URL or browser path')
      return null
    }

    // 使用child_process打开URL
    const execAsync = promisify(exec)

    try {
      await execAsync(`open -a "${browserPath}" "${url}"`)
    }
    catch (error) {
      console.error('[URLProvider] Failed to open URL:', error)
    }
    return null
  }

  /**
   * 检测是否为URL
   */
  private isURL(text: string): boolean {
    // 简单的URL检测
    return (
      this.URL_REGEX.test(text)
      || text.startsWith('http://')
      || text.startsWith('https://')
      || text.startsWith('www.')
      || text.includes('.')
    )
  }

  /**
   * 规范化URL (添加协议等)
   */
  private normalizeURL(text: string): string {
    let url = text.trim()

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // 如果以www开头,添加https
      if (url.startsWith('www.')) {
        url = `https://${url}`
      }
      // 否则尝试添加https://
      else if (url.includes('.')) {
        url = `https://${url}`
      }
    }

    return url
  }

  /**
   * 获取所有已安装的浏览器
   */
  private async getInstalledBrowsers(): Promise<
    Array<{
      id: string
      name: string
      bundleId: string
      path: string
      icon?: string
    }>
  > {
    const knownBrowsers = [
      { id: 'chrome', name: 'Chrome', bundleId: 'com.google.Chrome', icon: '🟡' },
      { id: 'safari', name: 'Safari', bundleId: 'com.apple.Safari', icon: '🧭' },
      { id: 'firefox', name: 'Firefox', bundleId: 'org.mozilla.firefox', icon: '🦊' },
      { id: 'edge', name: 'Edge', bundleId: 'com.microsoft.edgemac', icon: '🌊' },
      { id: 'brave', name: 'Brave', bundleId: 'com.brave.Browser', icon: '🦁' },
      { id: 'opera', name: 'Opera', bundleId: 'com.operasoftware.Opera', icon: '🔴' },
      { id: 'arc', name: 'Arc', bundleId: 'company.thebrowser.Browser', icon: '🌈' },
    ]

    const allApps = await appScanner.getApps()
    const installedBrowsers: Array<{
      id: string
      name: string
      bundleId: string
      path: string
      icon?: string
    }> = []

    for (const browser of knownBrowsers) {
      // 检查该浏览器是否已安装
      // Assuming appScanner.getApps() returns objects with bundleId
      const app = allApps.find((a: any) => a.bundleId === browser.bundleId)
      if (app) {
        installedBrowsers.push({
          id: browser.id,
          name: browser.name,
          bundleId: browser.bundleId,
          path: app.path,
          icon: browser.icon,
        })
      }
    }

    return installedBrowsers
  }
}

export const urlProvider = new URLProvider()
