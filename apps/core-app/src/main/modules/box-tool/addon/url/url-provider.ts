import type { ISearchProvider, TuffItem, TuffQuery } from '@talex-touch/utils'
import type { ProviderContext } from '../../search-engine/types'
import { TuffFactory, TuffInputType } from '@talex-touch/utils'

/**
 * URL Provider
 * 检测URL输入并聚合所有可用浏览器,提供"用XX打开链接"选项
 */
class URLProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'url-provider'
  readonly name = 'URL Actions'
  readonly icon = '🔗'
  readonly description = 'Open URLs with installed browsers'
  readonly supportedInputTypes = [TuffInputType.Text]

  private readonly URL_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i

  async onSearch(query: TuffQuery): Promise<TuffItem[]> {
    const text = query.text.trim()

    // 检测是否为URL
    if (!this.isURL(text)) {
      return []
    }

    const normalizedURL = this.normalizeURL(text)

    // 获取所有已安装的浏览器
    const browsers = await this.getInstalledBrowsers()

    if (browsers.length === 0) {
      return []
    }

    // 为每个浏览器创建一个打开链接的action
    const items: TuffItem[] = browsers.map((browser, index) => {
      return TuffFactory.createItem()
        .setId(`${this.id}:${browser.id}:${normalizedURL}`)
        .setTitle(`用 ${browser.name} 打开`)
        .setSubtitle(normalizedURL)
        .setIcon(browser.icon || '🌐')
        .setSource({ id: this.id, type: 'url_action', name: this.name })
        .setMeta({
          url: normalizedURL,
          browserBundleId: browser.bundleId,
          browserPath: browser.path,
          actionType: 'open_url',
        })
        .setScoring({
          score: 1000 - index, // 按顺序降权,确保浏览器聚合在前
          reasons: ['URL detected'],
        })
        .build()
    })

    return items
  }

  async onExecute(params: { item: TuffItem }): Promise<void> {
    const { item } = params
    const { url, browserPath } = item.meta as {
      url: string
      browserBundleId: string
      browserPath: string
    }

    if (!url || !browserPath) {
      console.error('[URLProvider] Missing URL or browser path')
      return
    }

    // 使用child_process打开URL
    const { exec } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(exec)

    try {
      await execAsync(`open -a "${browserPath}" "${url}"`)
    }
    catch (error) {
      console.error('[URLProvider] Failed to open URL:', error)
    }
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

    // 通过app-indexer获取已安装的应用
    const { appIndexer } = await import('../apps/app-indexer')
    await appIndexer.ensureIndexed()

    const allApps = appIndexer.getAllApps()
    const installedBrowsers: Array<{
      id: string
      name: string
      bundleId: string
      path: string
      icon?: string
    }> = []

    for (const browser of knownBrowsers) {
      // 检查该浏览器是否已安装
      const app = allApps.find(a => a.bundleId === browser.bundleId)
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
