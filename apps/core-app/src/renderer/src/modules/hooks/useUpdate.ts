import { ref, h } from 'vue'
import { ElMessage } from 'element-plus'
import { popperMention } from '../mention/dialog-mention'
import AppUpdateView from '~/components/base/AppUpgradationView.vue'
import { useAppState } from './useAppStates'
import { useDownloadCenter } from './useDownloadCenter'
import { getTouchSDK } from '@talex-touch/utils/renderer'
import {
  AppPreviewChannel,
  GitHubRelease,
  UpdateCheckResult,
  UpdateSourceConfig,
  UpdateProviderType,
  DownloadModule,
  DownloadPriority
} from '@talex-touch/utils'

/**
 * Update settings configuration
 */
interface UpdateSettings {
  enabled: boolean
  frequency: 'startup' | 'daily' | 'weekly' | 'monthly' | 'never'
  source: UpdateSourceConfig
  crossChannel: boolean
  ignoredVersions: string[]
  cacheEnabled: boolean
  cacheTTL: number // Cache TTL in minutes
  rateLimitEnabled: boolean
  maxRetries: number
  retryDelay: number // Base retry delay in milliseconds
}

export interface GithubAuthor {
  login: string
  id: number
  node_id: string
  avatar_url: string
  gravatar_id: string
  url: string
  html_url: string
  followers_url: string
  following_url: string
  gists_url: string
  starred_url: string
  subscriptions_url: string
  organizations_url: string
  repos_url: string
  events_url: string
  received_events_url: string
  type: string
  site_admin: boolean
}

/**
 * Application version information
 */
export interface AppVersion {
  channel: AppPreviewChannel
  major: number
  minor: number
  patch: number
}

/**
 * Simplified application update manager that communicates with main process
 */
export class AppUpdate {
  private static instance: AppUpdate
  private settings: UpdateSettings
  private touchSDK: ReturnType<typeof getTouchSDK>

  version: AppVersion

  private constructor() {
    const pkg = window.$nodeApi.getPackageJSON()
    this.version = this._versionResolver(pkg.version)
    try {
      this.touchSDK = getTouchSDK()
    } catch (error) {
      console.warn('TouchSDK not initialized, using fallback:', error)
      this.touchSDK = null as any
    }
    this.settings = this.getDefaultSettings()
  }

  /**
   * Resolve version string to AppVersion object
   * @param _versionStr - Version string (e.g., "1.0.0-SNAPSHOT")
   * @returns Parsed version object
   */
  _versionResolver(_versionStr: string): AppVersion {
    const versionStr = _versionStr.replaceAll('v', '')

    // 1.0.0-SNAPSHOT
    const versionArr = versionStr.split('-')
    const version = versionArr[0]
    const channel =
      versionArr.length === 2 ? versionArr[1] || AppPreviewChannel.MASTER : AppPreviewChannel.MASTER

    const versionNumArr = version.split('.')

    return {
      channel: channel as AppPreviewChannel,
      major: +versionNumArr[0],
      minor: parseInt(versionNumArr[1]),
      patch: parseInt(versionNumArr[2])
    }
  }

  /**
   * Get singleton instance of AppUpdate
   * @returns AppUpdate instance
   */
  public static getInstance(): AppUpdate {
    if (!AppUpdate.instance) {
      AppUpdate.instance = new AppUpdate()
    }

    return AppUpdate.instance
  }

  /**
   * Check for available updates via main process
   * @param force - Force check regardless of frequency settings
   * @returns Update check result
   */
  public async check(force = false): Promise<UpdateCheckResult> {
    try {
      if (!this.touchSDK || !this.touchSDK.rawChannel) {
        return {
          hasUpdate: false,
          error: 'TouchSDK not initialized',
          source: 'Unknown'
        }
      }

      const response = await this.touchSDK.rawChannel.send('update:check', force)

      if (response.success) {
        return response.data
      } else {
        return {
          hasUpdate: false,
          error: response.error || 'Update check failed',
          source: 'Unknown'
        }
      }
    } catch (error) {
      console.error('[AppUpdate] Check failed:', error)
      return {
        hasUpdate: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'Unknown'
      }
    }
  }

  /**
   * Download update package
   * @param release - GitHub release information
   * @returns Promise that resolves when download is started
   */
  public async downloadUpdate(release: GitHubRelease): Promise<void> {
    const { addDownloadTask } = useDownloadCenter()

    // 获取当前平台的下载资源
    const assets = release.assets
    const currentPlatform = process.platform
    const currentArch = process.arch

    const asset = assets.find((a: unknown) => {
      const name = (a as any).name.toLowerCase()
      const platformMatch =
        (currentPlatform === 'win32' && (name.includes('win') || name.includes('.exe'))) ||
        (currentPlatform === 'darwin' && (name.includes('mac') || name.includes('.dmg'))) ||
        (currentPlatform === 'linux' && (name.includes('linux') || name.includes('.AppImage')))

      const archMatch =
        (currentArch === 'x64' && (name.includes('x64') || name.includes('amd64'))) ||
        (currentArch === 'arm64' && (name.includes('arm64') || name.includes('aarch64')))

      return platformMatch && archMatch
    })

    if (!asset) {
      throw new Error('No suitable download asset found for current platform')
    }

    // 创建下载任务
    await addDownloadTask({
      url: (asset as any).url,
      destination: window.$nodeApi.getPath('downloads'),
      filename: (asset as any).name,
      priority: DownloadPriority.CRITICAL,
      module: DownloadModule.APP_UPDATE,
      metadata: {
        releaseTag: release.tag_name,
        releaseName: release.name,
        releaseNotes: release.body,
        platform: currentPlatform,
        arch: currentArch
      },
      checksum: (asset as any).checksum
    })
  }

  /**
   * Get default update settings
   * @returns Default update settings
   */
  private getDefaultSettings(): UpdateSettings {
    return {
      enabled: true,
      frequency: 'weekly', // Changed from 'startup' to 'weekly' to reduce API calls
      source: {
        type: UpdateProviderType.GITHUB,
        name: 'GitHub Releases',
        url: 'https://api.github.com/repos/talex-touch/tuff/releases',
        enabled: true,
        priority: 1
      },
      crossChannel: false,
      ignoredVersions: [],
      cacheEnabled: true,
      cacheTTL: 30, // 30 minutes cache TTL
      rateLimitEnabled: true,
      maxRetries: 3,
      retryDelay: 2000 // 2 seconds base retry delay
    }
  }

  /**
   * Get current update settings from main process
   * @returns Current update settings
   */
  public async getSettings(): Promise<UpdateSettings> {
    try {
      if (!this.touchSDK || !this.touchSDK.rawChannel) {
        console.warn('[AppUpdate] TouchSDK not initialized, returning default settings')
        return this.settings
      }

      const response = await this.touchSDK.rawChannel.send('update:get-settings')
      if (response.success) {
        this.settings = response.data
      }
      return this.settings
    } catch (error) {
      console.error('[AppUpdate] Failed to get settings:', error)
      return this.settings
    }
  }

  /**
   * Update settings in main process
   * @param settings - Partial settings to update
   */
  public async updateSettings(settings: Partial<UpdateSettings>): Promise<void> {
    try {
      if (!this.touchSDK || !this.touchSDK.rawChannel) {
        throw new Error('TouchSDK not initialized')
      }

      const response = await this.touchSDK.rawChannel.send('update:update-settings', settings)
      if (response.success) {
        this.settings = { ...this.settings, ...settings }
      } else {
        throw new Error(response.error || 'Failed to update settings')
      }
    } catch (error) {
      console.error('[AppUpdate] Failed to update settings:', error)
      throw error
    }
  }

  /**
   * Clear update cache
   */
  public async clearCache(): Promise<void> {
    try {
      if (!this.touchSDK || !this.touchSDK.rawChannel) {
        throw new Error('TouchSDK not initialized')
      }

      const response = await this.touchSDK.rawChannel.send('update:clear-cache')
      if (!response.success) {
        throw new Error(response.error || 'Failed to clear cache')
      }
    } catch (error) {
      console.error('[AppUpdate] Failed to clear cache:', error)
      throw error
    }
  }

  /**
   * Get update status from main process
   */
  public async getStatus(): Promise<any> {
    try {
      if (!this.touchSDK || !this.touchSDK.rawChannel) {
        throw new Error('TouchSDK not initialized')
      }

      const response = await this.touchSDK.rawChannel.send('update:get-status')
      if (response.success) {
        return response.data
      } else {
        throw new Error(response.error || 'Failed to get status')
      }
    } catch (error) {
      console.error('[AppUpdate] Failed to get status:', error)
      throw error
    }
  }
}

/**
 * Application upgrade related hooks
 * @returns Application upgrade utilities
 */
export function useApplicationUpgrade() {
  const appUpdate = AppUpdate.getInstance()
  const { appStates } = useAppState()
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Check application update
   * @param force - Force check regardless of frequency settings
   * @returns Promise<void>
   */
  async function checkApplicationUpgrade(force = false): Promise<void> {
    try {
      loading.value = true
      error.value = null

      const result = await appUpdate.check(force)
      console.log('[useApplicationUpgrade] Update check result:', result)

      window.$startupInfo.appUpdate = result.hasUpdate

      if (result.hasUpdate && result.release) {
        appStates.hasUpdate = true

        if (result.release) {
          await popperMention('New Version Available', () => {
            return h(AppUpdateView, {
              release: result.release as unknown as Record<string, unknown>
            })
          })
        }
      } else if (result.error) {
        handleUpdateError(result.error, result.source)
      }
    } catch (err) {
      console.error('[useApplicationUpgrade] Update check failed:', err)
      error.value = err instanceof Error ? err.message : 'Unknown error'
      handleUpdateError(error.value, 'Unknown')
    } finally {
      loading.value = false
    }
  }

  /**
   * Handle download update
   * @param release - GitHub release information
   */
  async function handleDownloadUpdate(release: GitHubRelease): Promise<void> {
    try {
      await appUpdate.downloadUpdate(release)
      ElMessage.success('更新包下载已开始，请查看下载中心')

      // 可以在这里打开下载中心
      // openDownloadCenter()
    } catch (err) {
      console.error('[useApplicationUpgrade] Download failed:', err)
      ElMessage.error(`下载失败: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Handle ignore version
   * @param release - GitHub release information
   */
  async function handleIgnoreVersion(release: GitHubRelease): Promise<void> {
    try {
      const settings = await appUpdate.getSettings()
      if (!settings.ignoredVersions.includes(release.tag_name)) {
        settings.ignoredVersions.push(release.tag_name)
        await appUpdate.updateSettings({ ignoredVersions: settings.ignoredVersions })
        ElMessage.success('已忽略此版本')
      }
    } catch (err) {
      console.error('[useApplicationUpgrade] Failed to ignore version:', err)
      ElMessage.error('忽略版本失败')
    }
  }

  /**
   * Handle update error
   * @param errorMessage - Error message
   * @param source - Error source
   */
  function handleUpdateError(errorMessage: string, source: string): void {
    console.warn(`[useApplicationUpgrade] Update error from ${source}:`, errorMessage)

    // 根据错误类型显示不同的提示
    if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
      ElMessage.warning('网络连接失败，请检查网络设置')
    } else if (errorMessage.includes('rate limit')) {
      ElMessage.warning('API请求频率过高，请稍后重试')
    } else if (errorMessage.includes('ignored')) {
      // 忽略版本不需要提示
      return
    } else {
      ElMessage.warning(`更新检查失败: ${errorMessage}`)
    }
  }

  /**
   * Get update settings
   * @returns Update settings
   */
  async function getUpdateSettings(): Promise<UpdateSettings> {
    return await appUpdate.getSettings()
  }

  /**
   * Update settings
   * @param settings - Partial settings to update
   */
  async function updateSettings(settings: Partial<UpdateSettings>): Promise<void> {
    await appUpdate.updateSettings(settings)
  }

  /**
   * Clear update cache
   */
  async function clearUpdateCache(): Promise<void> {
    try {
      await appUpdate.clearCache()
      ElMessage.success('更新缓存已清空')
    } catch (err) {
      console.error('[useApplicationUpgrade] Failed to clear cache:', err)
      ElMessage.error('清空缓存失败')
    }
  }

  /**
   * Get update status
   */
  async function getUpdateStatus(): Promise<unknown> {
    return await appUpdate.getStatus()
  }

  /**
   * Listen for update notifications from main process
   * This should be called after TouchSDK is initialized
   */
  function setupUpdateListener(): void {
    try {
      const touchSDK = getTouchSDK()

      touchSDK.onChannelEvent('update:available', (data: unknown) => {
        console.log('[useApplicationUpgrade] Received update notification:', data)

        if ((data as any).hasUpdate && (data as any).release) {
          appStates.hasUpdate = true

          // Show update dialog
          popperMention('New Version Available', () => {
            return h(AppUpdateView, {
              release: (data as any).release as unknown as Record<string, unknown>
            })
          })
        }
      })
    } catch (error) {
      console.warn('Failed to setup update listener:', error)
    }
  }

  return {
    checkApplicationUpgrade,
    handleDownloadUpdate,
    handleIgnoreVersion,
    getUpdateSettings,
    updateSettings,
    clearUpdateCache,
    getUpdateStatus,
    setupUpdateListener,
    loading,
    error
  }
}
