import { app } from 'electron'
import type { Result as ActiveWindowResult } from 'active-win'

export interface ActiveAppInfo {
  identifier: string | null
  displayName: string | null
  bundleId: string | null
  processId: number | null
  executablePath: string | null
  platform: ActiveWindowResult['platform'] | null
  windowTitle: string | null
  url?: string | null
  icon?: string | null
  lastUpdated: number
}

class ActiveAppService {
  private cache: { info: ActiveAppInfo; expiresAt: number } | null = null
  private activeWinModule: typeof import('active-win') | null = null
  private readonly cacheTTL = 750
  private importFailed = false

  private async resolveActiveWindow(): Promise<ActiveWindowResult | undefined> {
    if (this.importFailed) return undefined
    try {
      if (!this.activeWinModule) {
        this.activeWinModule = await import('active-win')
      }
      const { activeWindow } = this.activeWinModule
      return activeWindow({ accessibilityPermission: true, screenRecordingPermission: true })
    } catch (error) {
      if (!this.importFailed) {
        console.warn('[ActiveApp] Failed to resolve active window via active-win:', error)
      }
      this.importFailed = true
      return undefined
    }
  }

  private async resolveIcon(appPath: string | null): Promise<string | null> {
    if (!appPath) return null
    try {
      const icon = await app.getFileIcon(appPath, { size: 'small' })
      if (!icon || icon.isEmpty()) return null
      return icon.toDataURL()
    } catch (error) {
      console.debug('[ActiveApp] Unable to read app icon:', error)
      return null
    }
  }

  public async getActiveApp(forceRefresh = false): Promise<ActiveAppInfo | null> {
    if (!forceRefresh && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.info
    }

    const activeWindow = await this.resolveActiveWindow()
    if (!activeWindow) {
      this.cache = null
      return null
    }

    const owner: ActiveWindowResult['owner'] = activeWindow.owner
    const bundleId = (activeWindow.platform === 'macos' && 'bundleId' in owner ? owner.bundleId : null) ?? null
    const executablePath = owner.path ?? null
    const displayName = owner.name ?? null
    const processId = owner.processId ?? null

    const info: ActiveAppInfo = {
      identifier: bundleId || executablePath || displayName,
      displayName,
      bundleId,
      executablePath,
      processId,
      platform: activeWindow.platform ?? null,
      windowTitle: activeWindow.title ?? null,
      url: 'url' in activeWindow ? activeWindow.url ?? null : null,
      icon: null,
      lastUpdated: Date.now()
    }

    info.icon = await this.resolveIcon(executablePath)

    this.cache = {
      info,
      expiresAt: Date.now() + this.cacheTTL
    }

    return info
  }
}

export const activeAppService = new ActiveAppService()
