import type {
  CachedUpdateRecord,
  GitHubRelease,
  UpdateCheckResult,
  UpdateSettings,
  UpdateUserAction
} from '@talex-touch/utils'
import {
  AppPreviewChannel,
  UpdateProviderType,
  UPDATE_GITHUB_RELEASES_API,
  resolveUpdateChannelLabel,
  splitUpdateTag
} from '@talex-touch/utils'
import { TimeoutError, withTimeout } from '@talex-touch/utils/common/utils/time'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { UpdateEvents } from '@talex-touch/utils/transport/events'
import { h, ref } from 'vue'
import { toast } from 'vue-sonner'
import AppUpdateView from '~/components/base/AppUpgradationView.vue'
import { blowMention } from '../mention/dialog-mention'
import { useAppState } from './useAppStates'
import { useStartupInfo } from './useStartupInfo'

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

type UpdateTransportResponse<T> = { success: true; data: T } | { success: false; error?: string }

type UpdateStatusInfo = {
  enabled: boolean
  frequency: UpdateSettings['frequency']
  source: UpdateSettings['source']
  channel: AppPreviewChannel
  polling: boolean
  lastCheck: number | null
}

type UpdateCheckPayload = { force?: boolean }
type UpdateSettingsPayload = { settings: Partial<UpdateSettings> }
type UpdateCachedReleasePayload = { channel?: AppPreviewChannel }
type UpdateRecordActionPayload = { tag: string; action: UpdateUserAction }

type UpdateAvailablePayload = {
  hasUpdate: boolean
  release?: GitHubRelease
  source?: string
  channel?: AppPreviewChannel
}

/**
 * Simplified application update manager that communicates with main process
 */
export class AppUpdate {
  private static instance: AppUpdate
  private settings: UpdateSettings
  private transport = useTuffTransport()
  private static readonly CHANNEL_TIMEOUT = 4000

  version: AppVersion

  private constructor() {
    const { startupInfo } = useStartupInfo()
    const version = startupInfo.value?.version || '0.0.0'
    this.version = this._versionResolver(version)
    this.settings = this.getDefaultSettings()
  }

  /**
   * Resolve version string to AppVersion object
   * @param _versionStr - Version string (e.g., "1.0.0-SNAPSHOT")
   * @returns Parsed version object
   */
  _versionResolver(_versionStr: string): AppVersion {
    const { version, channelLabel } = splitUpdateTag(_versionStr)
    const channel = this.normalizeChannelLabel(channelLabel)

    const versionNumArr = version.split('.')

    return {
      channel,
      major: +versionNumArr[0],
      minor: Number.parseInt(versionNumArr[1]),
      patch: Number.parseInt(versionNumArr[2])
    }
  }

  private normalizeChannelLabel(label?: string): AppPreviewChannel {
    return resolveUpdateChannelLabel(label)
  }

  private normalizeFrequencyLabel(value?: string): UpdateSettings['frequency'] {
    switch (value) {
      case 'everyday':
      case '1day':
      case '3day':
      case '7day':
      case '1month':
      case 'never':
        return value
      case 'daily':
        return '1day'
      case 'weekly':
        return '7day'
      case 'monthly':
        return '1month'
      case 'startup':
        return 'everyday'
      default:
        return 'everyday'
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
      const response = await this.sendRequest<UpdateCheckResult>('update:check', { force })

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
    const response = await this.sendRequest<{ taskId?: string }>('update:download', release)
    if (!response.success) {
      throw new Error(response.error || 'Failed to start update download')
    }
  }

  /**
   * Get default update settings
   * @returns Default update settings
   */
  private getDefaultSettings(): UpdateSettings {
    const defaultChannel =
      this.version.channel === AppPreviewChannel.SNAPSHOT
        ? AppPreviewChannel.SNAPSHOT
        : AppPreviewChannel.RELEASE

    return {
      enabled: true,
      frequency: 'everyday',
      source: {
        type: UpdateProviderType.GITHUB,
        name: 'GitHub Releases',
        url: UPDATE_GITHUB_RELEASES_API,
        enabled: true,
        priority: 1
      },
      updateChannel: defaultChannel,
      ignoredVersions: [],
      customSources: [],
      autoDownload: false,
      cacheEnabled: true,
      cacheTTL: 30, // 30 minutes cache TTL
      rateLimitEnabled: true,
      maxRetries: 3,
      retryDelay: 2000, // 2 seconds base retry delay
      lastCheckedAt: null
    }
  }

  /**
   * Get current update settings from main process
   * @returns Current update settings
   */
  public async getSettings(): Promise<UpdateSettings> {
    try {
      const response = await this.sendRequest<UpdateSettings>('update:get-settings')
      if (response.success) {
        const serverSettings = response.data
        serverSettings.frequency = this.normalizeFrequencyLabel(serverSettings.frequency)
        this.settings = serverSettings
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
      const payload: Partial<UpdateSettings> = { ...settings }

      if (this.version.channel === AppPreviewChannel.SNAPSHOT) {
        payload.updateChannel = AppPreviewChannel.SNAPSHOT
      }

      if ('lastCheckedAt' in payload) {
        delete (payload as Record<string, unknown>).lastCheckedAt
      }

      if ('frequency' in payload && payload.frequency) {
        payload.frequency = this.normalizeFrequencyLabel(payload.frequency)
      }

      const response = await this.sendRequest<void>('update:update-settings', payload)
      if (response.success) {
        this.settings = { ...this.settings, ...payload }
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
      const response = await this.sendRequest<void>('update:clear-cache')
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
  public async getStatus(): Promise<UpdateStatusInfo> {
    try {
      const response = await this.sendRequest<UpdateStatusInfo>('update:get-status')
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

  public async getCachedRelease(channel?: AppPreviewChannel): Promise<CachedUpdateRecord | null> {
    try {
      const response = await this.sendRequest<CachedUpdateRecord | null>(
        'update:get-cached-release',
        { channel }
      )
      if (response.success) {
        return (response.data as CachedUpdateRecord) || null
      }
      return null
    } catch (error) {
      console.error('[AppUpdate] Failed to get cached release:', error)
      return null
    }
  }

  public async recordAction(tag: string, action: UpdateUserAction): Promise<void> {
    try {
      const response = await this.sendRequest<void>('update:record-action', { tag, action })
      if (!response.success) {
        throw new Error(response.error || 'Failed to record action')
      }
    } catch (error) {
      console.error('[AppUpdate] Failed to record action:', error)
      throw error
    }
  }

  private async sendRequest<T>(
    channel: string,
    payload?: unknown
  ): Promise<UpdateTransportResponse<T>> {
    try {
      switch (channel) {
        case 'update:check': {
          const requestPayload: UpdateCheckPayload =
            payload && typeof payload === 'object' ? (payload as UpdateCheckPayload) : {}
          return (await withTimeout(
            this.transport.send(UpdateEvents.check, requestPayload),
            AppUpdate.CHANNEL_TIMEOUT
          )) as UpdateTransportResponse<T>
        }
        case 'update:get-settings':
          return (await withTimeout(
            this.transport.send(UpdateEvents.getSettings),
            AppUpdate.CHANNEL_TIMEOUT
          )) as UpdateTransportResponse<T>
        case 'update:update-settings': {
          const settings =
            payload && typeof payload === 'object' ? (payload as Partial<UpdateSettings>) : {}
          const requestPayload: UpdateSettingsPayload = { settings }
          return (await withTimeout(
            this.transport.send(UpdateEvents.updateSettings, requestPayload),
            AppUpdate.CHANNEL_TIMEOUT
          )) as UpdateTransportResponse<T>
        }
        case 'update:clear-cache':
          return (await withTimeout(
            this.transport.send(UpdateEvents.clearCache),
            AppUpdate.CHANNEL_TIMEOUT
          )) as UpdateTransportResponse<T>
        case 'update:get-status':
          return (await withTimeout(
            this.transport.send(UpdateEvents.getStatus),
            AppUpdate.CHANNEL_TIMEOUT
          )) as UpdateTransportResponse<T>
        case 'update:get-cached-release': {
          const requestPayload: UpdateCachedReleasePayload =
            payload && typeof payload === 'object' ? (payload as UpdateCachedReleasePayload) : {}
          return (await withTimeout(
            this.transport.send(UpdateEvents.getCachedRelease, requestPayload),
            AppUpdate.CHANNEL_TIMEOUT
          )) as UpdateTransportResponse<T>
        }
        case 'update:record-action': {
          if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid update action payload')
          }
          const requestPayload = payload as UpdateRecordActionPayload
          return (await withTimeout(
            this.transport.send(UpdateEvents.recordAction, requestPayload),
            AppUpdate.CHANNEL_TIMEOUT
          )) as UpdateTransportResponse<T>
        }
        case 'update:download': {
          if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid update download payload')
          }
          const requestPayload = payload as GitHubRelease
          return (await withTimeout(
            this.transport.send(UpdateEvents.download, requestPayload),
            AppUpdate.CHANNEL_TIMEOUT
          )) as UpdateTransportResponse<T>
        }
        default:
          throw new Error(`Unsupported update channel: ${channel}`)
      }
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new Error(`Update request timed out for channel: ${channel}`)
      }
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
  async function checkApplicationUpgrade(force = false): Promise<UpdateCheckResult | undefined> {
    try {
      loading.value = true
      error.value = null
      const { setAppUpdate } = useStartupInfo()

      const result = await appUpdate.check(force)
      console.log('[useApplicationUpgrade] Update check result:', result)

      setAppUpdate(result.hasUpdate)

      if (result.hasUpdate && result.release) {
        appStates.hasUpdate = true
        appStates.noUpdateAvailable = false
        clearUpdateErrorMessage()

        if (result.release) {
          const currentRelease = result.release
          await blowMention('New Version Available', () => {
            return h(AppUpdateView, {
              release: currentRelease as unknown as Record<string, unknown>,
              onUpdateNow: () => handleUpdateAcknowledged(currentRelease),
              onSkipVersion: () => handleIgnoreVersion(currentRelease),
              onRemindLater: () => handleRemindLaterSelection(currentRelease)
            })
          })
        }
      } else if (result.error) {
        appStates.noUpdateAvailable = false
        handleUpdateError(result.error, result.source)
      } else {
        appStates.hasUpdate = false
        appStates.noUpdateAvailable = true
        clearUpdateErrorMessage()
      }
      return result
    } catch (err) {
      console.error('[useApplicationUpgrade] Update check failed:', err)
      error.value = err instanceof Error ? err.message : 'Unknown error'
      handleUpdateError(error.value, 'Unknown')
      appStates.noUpdateAvailable = false
      return undefined
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
      toast.success('更新包下载已开始，请查看下载中心')

      // 可以在这里打开下载中心
      // openDownloadCenter()
    } catch (err) {
      console.error('[useApplicationUpgrade] Download failed:', err)
      toast.error(`下载失败: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  async function handleUpdateAcknowledged(release: GitHubRelease): Promise<void> {
    try {
      await appUpdate.recordAction(release.tag_name, 'update-now')
      appStates.hasUpdate = false
      appStates.noUpdateAvailable = false
      clearUpdateErrorMessage()
    } catch (err) {
      console.warn('[useApplicationUpgrade] Failed to acknowledge update:', err)
    }
  }

  async function handleRemindLaterSelection(release: GitHubRelease): Promise<void> {
    try {
      await appUpdate.recordAction(release.tag_name, 'remind-later')
      toast.success('已为您延后提醒，8小时后再次提示')
      appStates.hasUpdate = false
      appStates.noUpdateAvailable = true
      clearUpdateErrorMessage()
    } catch (err) {
      console.error('[useApplicationUpgrade] Failed to set remind later:', err)
      toast.error('设置稍后提醒失败，请稍后重试')
    }
  }

  /**
   * Handle ignore version
   * @param release - GitHub release information
   */
  async function handleIgnoreVersion(release: GitHubRelease): Promise<void> {
    try {
      const settings = await appUpdate.getSettings()
      let updatedList = false
      if (!settings.ignoredVersions.includes(release.tag_name)) {
        settings.ignoredVersions.push(release.tag_name)
        await appUpdate.updateSettings({ ignoredVersions: settings.ignoredVersions })
        updatedList = true
      }
      await appUpdate.recordAction(release.tag_name, 'skip')
      toast.success(updatedList ? '已忽略此版本' : '已跳过此版本')
      appStates.hasUpdate = false
      appStates.noUpdateAvailable = true
      clearUpdateErrorMessage()
    } catch (err) {
      console.error('[useApplicationUpgrade] Failed to ignore version:', err)
      toast.error('忽略版本失败')
    }
  }

  /**
   * Handle update error
   * @param errorMessage - Error message
   * @param source - Error source
   */
  function handleUpdateError(errorMessage: string, source: string): void {
    console.warn(`[useApplicationUpgrade] Update error from ${source}:`, errorMessage)

    const normalizedMessage = resolveUpdateErrorMessage(errorMessage)
    appStates.updateErrorMessage = normalizedMessage
  }

  function clearUpdateErrorMessage(): void {
    appStates.updateErrorMessage = ''
  }

  function resolveUpdateErrorMessage(errorMessage: string): string {
    const lowerCaseMessage = errorMessage.toLowerCase()

    if (lowerCaseMessage.includes('ignored')) {
      return ''
    }
    if (lowerCaseMessage.includes('network') || lowerCaseMessage.includes('timeout')) {
      return '网络连接失败，请检查网络设置'
    }
    if (lowerCaseMessage.includes('rate limit')) {
      return 'API请求频率过高，请稍后重试'
    }
    return `更新检查失败: ${errorMessage}`
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
      toast.success('更新缓存已清空')
    } catch (err) {
      console.error('[useApplicationUpgrade] Failed to clear cache:', err)
      toast.error('清空缓存失败')
    }
  }

  /**
   * Get update status
   */
  async function getUpdateStatus(): Promise<unknown> {
    return await appUpdate.getStatus()
  }

  async function getCachedRelease(channel?: AppPreviewChannel): Promise<CachedUpdateRecord | null> {
    return await appUpdate.getCachedRelease(channel)
  }

  /**
   * Listen for update notifications from main process
   * This should be called after TouchSDK is initialized
   */
  function setupUpdateListener(): void {
    try {
      const transport = useTuffTransport()

      transport.on(UpdateEvents.available, (data: UpdateAvailablePayload) => {
        console.log('[useApplicationUpgrade] Received update notification:', data)

        if (data.hasUpdate && data.release) {
          appStates.hasUpdate = true

          blowMention('New Version Available', () => {
            return h(AppUpdateView, {
              release: data.release as unknown as Record<string, unknown>
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
    getCachedRelease,
    setupUpdateListener,
    loading,
    error
  }
}
