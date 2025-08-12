import WinApp from './apps/win'
import DarwinApp from './apps/darwin'
import LinuxApp from './apps/linux'

import PinyinMatch from 'pinyin-match'
import PinyinMatchTw from 'pinyin-match/es/traditional.js';
import { isAsyncFunction } from 'node:util/types';

const env = process.platform

let appSearch: any;

if (env === 'darwin') {
  appSearch = DarwinApp
} else if (env === 'win32') {
  appSearch = WinApp
} else if (env === 'linux') {
  appSearch = LinuxApp
}

/**
 * App DataManager
 * Implementation of app data management, 实现智能缓存和刷新策略
 */
class AppDataManager {
  private apps: any[] = []
  private lastUpdateTime: number = 0
  private isUpdating: boolean = false
  private updateTimer: NodeJS.Timeout | null = null

  private readonly CACHE_DURATION = 60 * 60 * 1000 // 1小时缓存时间
  private readonly DEBOUNCE_TIME = 5 * 1000 // 5秒防抖时间
  private readonly AUTO_REFRESH_INTERVAL = 60 * 60 * 1000 // 1小时自动刷新间隔

  constructor() {
    this.startAutoRefresh()
  }

  /**
   * Start Auto Refresh Timer
   */
  private startAutoRefresh() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
    }

    this.updateTimer = setInterval(() => {
      console.log('[AppDataManager] Auto refresh triggered')
      this.refreshApps(true)
    }, this.AUTO_REFRESH_INTERVAL)
  }

  /**
   * Check if refresh is needed
   */
  private shouldRefresh(forceRefresh: boolean = false): boolean {
    if (forceRefresh) return true
    if (this.apps.length === 0) return true
    if (this.isUpdating) return false

    const now = Date.now()
    const timeSinceLastUpdate = now - this.lastUpdateTime

    return timeSinceLastUpdate > this.CACHE_DURATION
  }

  /**
   * Get Raw App Data
   */
  private async getRawApps(): Promise<any[]> {
    const res: any[] = []

    if (isAsyncFunction(appSearch)) {
      const apps = await appSearch()
      res.push(...apps)
    } else {
      res.push(...appSearch())
    }

    return res
  }

  /**
   * Refresh App Data
   */
  private async refreshApps(forceRefresh: boolean = false): Promise<void> {
    if (!this.shouldRefresh(forceRefresh)) {
      return
    }

    if (this.isUpdating) {
      console.log('[AppDataManager] Already updating, skipping...')
      return
    }

    this.isUpdating = true

    try {
      console.log('[AppDataManager] Refreshing app data...')
      const newApps = await this.getRawApps()

      this.apps = newApps
      this.lastUpdateTime = Date.now()

      console.log(`[AppDataManager] App data refreshed, found ${newApps.length} apps`)
    } catch (error) {
      console.error('[AppDataManager] Failed to refresh app data:', error)
    } finally {
      this.isUpdating = false
    }
  }

  /**
   * Get Apps（Exposed）
   */
  async getApps(forceRefresh: boolean = false): Promise<any[]> {
    await this.refreshApps(forceRefresh)
    return [...this.apps]
  }

  /**
   * Get Apps（Sync）
   */
  getAppsSync(): any[] {
    if (this.apps.length === 0 && !this.isUpdating) {
      try {
        if (!isAsyncFunction(appSearch)) {
          this.apps = appSearch()
          this.lastUpdateTime = Date.now()
        }
      } catch (error) {
        console.error('[AppDataManager] Failed to get apps synchronously:', error)
      }
    }

    return [...this.apps]
  }

  /**
   * Trigger refresh on CoreBox Show
   */
  async onCoreBoxShow(): Promise<void> {
    const now = Date.now()
    const timeSinceLastUpdate = now - this.lastUpdateTime

    if (timeSinceLastUpdate > this.DEBOUNCE_TIME) {
      await this.refreshApps()
    }
  }

  /**
   * Destroy Manager
   */
  destroy() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
      this.updateTimer = null
    }
  }
}

const appDataManager = new AppDataManager()

export function getApps() {
  return appDataManager.getAppsSync()
}

export async function getAppsAsync(forceRefresh: boolean = false) {
  return await appDataManager.getApps(forceRefresh)
}

export { appDataManager }

export let apps: any = getApps()

function check(keyword: string, appName: string) {
  let res = PinyinMatch.match(appName, keyword)

  if (res !== false) return res

  return PinyinMatchTw.match(appName, keyword)
}

export default async (keyword: string) => {
  const currentApps = appDataManager.getAppsSync()
  const currentAppNames = currentApps?.map((app: any) => app.name) || []

  let res = new Array<any>()
  let index = 0;

  for (let appName of currentAppNames) {
    const matched = check(keyword, appName)

    if (matched !== false) {
      const app = currentApps[index]
      if (app) {
        res.push({
          ...app,
          matched
        })
      }
    }
    index++
  }

  return res
}
