import { AppPreviewChannel, type GitHubRelease } from '@talex-touch/utils'
import fs from 'node:fs'
import path from 'node:path'
import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { LogOptions } from '../../../utils/logger'

export interface MacAutoUpdaterAdapterDeps {
  getChannel: () => AppPreviewChannel
  isUpdateCandidate: (version: string) => boolean
  getPendingInstallVersion: () => string | null
  setPendingInstallVersion: (version: string | null) => void
  saveSettings: () => void
  flushSettings: () => Promise<void>
  log: {
    info: (message: string, options?: LogOptions) => void
    warn: (message: string, options?: LogOptions) => void
    error: (message: string, options?: LogOptions) => void
  }
}

/** Owns electron-updater wiring and its transient macOS update state. */
export class MacAutoUpdaterAdapter {
  private initialized = false
  private downloadInFlight = false
  private downloadedVersion: string | null = null
  private readyNotifiedVersion: string | null = null
  private configMissingLogged = false

  constructor(private readonly deps: MacAutoUpdaterAdapterDeps) {}

  isEnabled(): boolean {
    if (!app.isPackaged || process.platform !== 'darwin') {
      return false
    }

    const configPath = path.join(process.resourcesPath, 'app-update.yml')
    if (fs.existsSync(configPath)) {
      return true
    }

    if (!this.configMissingLogged) {
      this.configMissingLogged = true
      this.deps.log.warn('macOS autoUpdater disabled because app-update.yml is missing', {
        meta: { configPath }
      })
    }
    return false
  }

  setup(): void {
    if (this.initialized || !this.isEnabled()) {
      return
    }

    this.initialized = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = this.deps.getChannel() !== AppPreviewChannel.RELEASE
    autoUpdater.on('update-downloaded', this.onDownloaded)
    autoUpdater.on('error', this.onError)
  }

  syncChannel(): void {
    if (!this.isEnabled() || !this.initialized) {
      return
    }
    autoUpdater.allowPrerelease = this.deps.getChannel() !== AppPreviewChannel.RELEASE
  }

  restorePendingInstallVersion(): void {
    if (!this.initialized) {
      return
    }

    const pendingVersion = (this.deps.getPendingInstallVersion() ?? '').trim()
    if (pendingVersion && this.deps.isUpdateCandidate(pendingVersion)) {
      this.downloadedVersion = pendingVersion
    }
  }

  async download(release: GitHubRelease): Promise<void> {
    this.setup()
    if (this.downloadedVersion) {
      this.deps.log.info('macOS update already downloaded', {
        meta: { version: this.downloadedVersion }
      })
      return
    }
    if (this.downloadInFlight) {
      return
    }

    this.downloadInFlight = true
    try {
      this.syncChannel()
      this.deps.log.info('macOS autoUpdater checking for updates', {
        meta: { tag: release.tag_name }
      })
      await autoUpdater.checkForUpdates()
      await autoUpdater.downloadUpdate()
      this.deps.log.info('macOS autoUpdater download started', { meta: { tag: release.tag_name } })
    } catch (error) {
      this.deps.log.error('macOS autoUpdater download failed', { error })
      throw error
    } finally {
      this.downloadInFlight = false
    }
  }

  async install(): Promise<void> {
    if (!this.downloadedVersion) {
      throw new Error('macOS update has not been downloaded')
    }

    this.downloadedVersion = null
    this.readyNotifiedVersion = null
    this.deps.setPendingInstallVersion(null)
    try {
      await this.deps.flushSettings()
    } catch (error) {
      this.deps.log.warn('Failed to persist macOS pending update state before install', { error })
    }
    autoUpdater.quitAndInstall()
  }

  clearPendingInstallVersion(): void {
    this.downloadedVersion = null
    this.readyNotifiedVersion = null
    this.deps.setPendingInstallVersion(null)
  }

  getReadyVersion(): string | null {
    const version = this.downloadedVersion
    if (!version) {
      return null
    }
    if (this.deps.isUpdateCandidate(version)) {
      return version
    }

    this.deps.log.warn('Ignoring stale macOS pending update', {
      meta: { version, channel: this.deps.getChannel() }
    })
    this.clearPendingInstallVersion()
    this.deps.saveSettings()
    return null
  }

  dispose(): void {
    if (!this.initialized) {
      return
    }
    autoUpdater.removeListener('update-downloaded', this.onDownloaded)
    autoUpdater.removeListener('error', this.onError)
    this.initialized = false
  }

  private readonly onDownloaded = (info: { version?: string }): void => {
    const version = (info?.version || '').trim()
    if (!version) {
      this.deps.log.warn('macOS update downloaded without version info')
      return
    }
    if (!this.deps.isUpdateCandidate(version)) {
      this.deps.log.warn('macOS update ignored (version/channel mismatch)', {
        meta: { version, channel: this.deps.getChannel() }
      })
      this.clearPendingInstallVersion()
      this.deps.saveSettings()
      return
    }

    this.downloadedVersion = version
    this.readyNotifiedVersion = null
    this.deps.setPendingInstallVersion(version)
    this.deps.saveSettings()
    this.showReadyNotification(version)
  }

  private readonly onError = (error: unknown): void => {
    this.deps.log.error('Mac autoUpdater error', { error })
  }

  private showReadyNotification(version: string): void {
    if (!this.isEnabled() || this.readyNotifiedVersion === version) {
      return
    }

    this.readyNotifiedVersion = version
    const notification = new Notification({
      title: 'Update Ready',
      body: `Version ${version} is ready. Click to restart and finish updating.`,
      silent: false,
      urgency: 'critical',
      timeoutType: 'never'
    })
    notification.on('click', () => {
      void this.install().catch((error) => {
        this.deps.log.error('Failed to install macOS update', { error })
      })
    })
    notification.show()
  }
}
