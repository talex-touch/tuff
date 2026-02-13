import type {
  CachedUpdateRecord,
  DownloadTask,
  GitHubRelease,
  UpdateCheckResult,
  UpdateSettings,
  UpdateUserAction
} from '@talex-touch/utils'
import {
  AppPreviewChannel,
  DownloadModule,
  UpdateProviderType,
  UPDATE_GITHUB_RELEASES_API,
  resolveUpdateChannelLabel,
  splitUpdateTag
} from '@talex-touch/utils'
import { TimeoutError, withTimeout } from '@talex-touch/utils/common/utils/time'
import { useDownloadSdk, useUpdateSdk } from '@talex-touch/utils/renderer'
import { h, ref } from 'vue'
import { toast } from 'vue-sonner'
import AppUpdateView from '~/components/base/AppUpgradationView.vue'
import { useI18nText } from '~/modules/lang'
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

type UpdateStatusInfo = {
  enabled: boolean
  frequency: UpdateSettings['frequency']
  source: UpdateSettings['source']
  channel: AppPreviewChannel
  polling: boolean
  lastCheck: number | null
  downloadReady?: boolean
  downloadReadyVersion?: string | null
  downloadTaskId?: string | null
}

type UpdateAvailablePayload = {
  hasUpdate: boolean
  release?: GitHubRelease
  source?: string
  channel?: AppPreviewChannel
}

type NormalizedPlatform = 'win32' | 'darwin' | 'linux'
type NormalizedArch = 'x64' | 'arm64'

const updateListenerDisposers: Array<() => void> = []
const completedUpdateTaskIds = new Set<string>()
let updateListenerInitialized = false

function resolvePlatformFallback(): NormalizedPlatform {
  const runtimePlatform = typeof process !== 'undefined' ? process.platform : ''

  if (runtimePlatform === 'win32') return 'win32'
  if (runtimePlatform === 'darwin') return 'darwin'
  if (runtimePlatform === 'linux') return 'linux'

  return 'darwin'
}

function resolveArchFallback(): NormalizedArch {
  const runtimeArch = typeof process !== 'undefined' ? process.arch : ''
  return runtimeArch === 'arm64' ? 'arm64' : 'x64'
}

function normalizeAssetPlatform(platformValue: unknown, filename: string): NormalizedPlatform {
  const platform = typeof platformValue === 'string' ? platformValue.toLowerCase() : ''
  const lowerName = filename.toLowerCase()

  if (platform.includes('win') || lowerName.includes('win')) return 'win32'
  if (
    platform.includes('darwin') ||
    platform.includes('mac') ||
    lowerName.includes('darwin') ||
    lowerName.includes('mac')
  ) {
    return 'darwin'
  }
  if (
    platform.includes('linux') ||
    platform.includes('ubuntu') ||
    platform.includes('debian') ||
    lowerName.includes('linux') ||
    lowerName.includes('ubuntu') ||
    lowerName.includes('debian') ||
    lowerName.endsWith('.appimage')
  ) {
    return 'linux'
  }

  return resolvePlatformFallback()
}

function normalizeAssetArch(archValue: unknown, filename: string): NormalizedArch {
  const arch = typeof archValue === 'string' ? archValue.toLowerCase() : ''
  const lowerName = filename.toLowerCase()

  if (
    arch.includes('arm64') ||
    arch.includes('aarch64') ||
    lowerName.includes('arm64') ||
    lowerName.includes('aarch64')
  ) {
    return 'arm64'
  }

  if (
    arch.includes('x64') ||
    arch.includes('amd64') ||
    arch.includes('x86_64') ||
    lowerName.includes('x64') ||
    lowerName.includes('amd64') ||
    lowerName.includes('x86_64')
  ) {
    return 'x64'
  }

  return resolveArchFallback()
}

function normalizeReleaseForDownload(release: GitHubRelease): GitHubRelease {
  const source = release as unknown as Record<string, unknown>
  const rawAssets = Array.isArray(source.assets) ? source.assets : []

  const normalizedAssets = rawAssets
    .map((asset) => {
      const raw = asset as Record<string, unknown>
      const name = typeof raw.name === 'string' ? raw.name : ''
      const browserDownloadUrl =
        typeof raw.browser_download_url === 'string' ? raw.browser_download_url : ''
      const fallbackUrl = typeof raw.url === 'string' ? raw.url : ''
      const url = browserDownloadUrl || fallbackUrl

      if (!name || !url) {
        return null
      }

      const size = typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 0
      const checksum =
        typeof raw.checksum === 'string'
          ? raw.checksum
          : typeof raw.sha256 === 'string'
            ? raw.sha256
            : undefined

      const normalized: Record<string, unknown> = {
        name,
        url,
        size,
        platform: normalizeAssetPlatform(raw.platform, name),
        arch: normalizeAssetArch(raw.arch, name)
      }

      if (browserDownloadUrl) normalized.browser_download_url = browserDownloadUrl
      if (checksum) normalized.checksum = checksum
      if (typeof raw.sha256 === 'string') normalized.sha256 = raw.sha256
      if (typeof raw.signatureUrl === 'string') normalized.signatureUrl = raw.signatureUrl
      if (typeof raw.signatureKeyUrl === 'string') normalized.signatureKeyUrl = raw.signatureKeyUrl
      if (typeof raw.component === 'string') normalized.component = raw.component
      if (typeof raw.coreRange === 'string') normalized.coreRange = raw.coreRange

      return normalized
    })
    .filter((asset): asset is Record<string, unknown> => asset !== null)

  const tagName = typeof source.tag_name === 'string' ? source.tag_name : ''

  return {
    tag_name: tagName,
    name: typeof source.name === 'string' ? source.name : tagName,
    published_at:
      typeof source.published_at === 'string' ? source.published_at : new Date().toISOString(),
    body: typeof source.body === 'string' ? source.body : '',
    assets: normalizedAssets as unknown as GitHubRelease['assets']
  }
}

function resolveCompletedTaskVersion(task: DownloadTask): string | null {
  const version = task.metadata?.version
  if (typeof version === 'string' && version.trim().length > 0) {
    return version
  }
  return null
}

/**
 * Simplified application update manager that communicates with main process
 */
/**
 * @deprecated 请优先使用 useUpdateSdk() 直接调用 update domain SDK，该类仅保留兼容壳。
 */

export class AppUpdate {
  private static instance: AppUpdate
  private settings: UpdateSettings
  private updateSdk = useUpdateSdk()
  private static readonly CHANNEL_TIMEOUT = 4000
  private static readonly INSTALL_TIMEOUT = 10 * 60 * 1000

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
      const response = await this.sendRequest('update:check', () => this.updateSdk.check({ force }))

      if (response.success && response.data) {
        return response.data
      }
      return {
        hasUpdate: false,
        error: response.error || 'Update check failed',
        source: 'Unknown'
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
    const payload = normalizeReleaseForDownload(release)
    const response = await this.sendRequest('update:download', () =>
      this.updateSdk.download(payload)
    )
    if (!response.success) {
      throw new Error(response.error || 'Failed to start update download')
    }
  }

  public async installUpdate(taskId?: string): Promise<void> {
    const response = await this.sendRequest(
      'update:install',
      () => this.updateSdk.install(taskId ? { taskId } : {}),
      AppUpdate.INSTALL_TIMEOUT
    )
    if (!response.success) {
      throw new Error(response.error || 'Failed to install update')
    }
  }

  /**
   * Get default update settings
   * @returns Default update settings
   */
  private getDefaultSettings(): UpdateSettings {
    const defaultChannel =
      this.version.channel === AppPreviewChannel.SNAPSHOT
        ? AppPreviewChannel.BETA
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
      const response = await this.sendRequest('update:get-settings', () =>
        this.updateSdk.getSettings()
      )
      if (response.success && response.data) {
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
        payload.updateChannel = AppPreviewChannel.BETA
      }

      if ('lastCheckedAt' in payload) {
        delete (payload as Record<string, unknown>).lastCheckedAt
      }

      if ('frequency' in payload && payload.frequency) {
        payload.frequency = this.normalizeFrequencyLabel(payload.frequency)
      }

      const response = await this.sendRequest('update:update-settings', () =>
        this.updateSdk.updateSettings(payload)
      )
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
      const response = await this.sendRequest('update:clear-cache', () =>
        this.updateSdk.clearCache()
      )
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
      const response = await this.sendRequest('update:get-status', () => this.updateSdk.getStatus())
      if (response.success && response.data) {
        return response.data
      }
      throw new Error(response.error || 'Failed to get status')
    } catch (error) {
      console.error('[AppUpdate] Failed to get status:', error)
      throw error
    }
  }

  public async getCachedRelease(channel?: AppPreviewChannel): Promise<CachedUpdateRecord | null> {
    try {
      const response = await this.sendRequest('update:get-cached-release', () =>
        this.updateSdk.getCachedRelease({ channel })
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
      const response = await this.sendRequest('update:record-action', () =>
        this.updateSdk.recordAction({ tag, action })
      )
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
    operation: () => Promise<T>,
    timeout = AppUpdate.CHANNEL_TIMEOUT
  ): Promise<T> {
    try {
      return await withTimeout(operation(), timeout)
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
/**
 * @deprecated 请优先在页面内组合 useUpdateSdk() + 自定义 UI 逻辑，该 hook 仅保留兼容壳。
 */

export function useApplicationUpgrade() {
  const appUpdate = AppUpdate.getInstance()
  const { appStates } = useAppState()
  const { t } = useI18nText()
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function shouldSuppressUpdateDialog(release: GitHubRelease): Promise<boolean> {
    try {
      const status = await appUpdate.getStatus()
      if (!status?.downloadReady) {
        return false
      }
      if (!status.downloadReadyVersion) {
        return true
      }
      return status.downloadReadyVersion === release.tag_name
    } catch {
      return false
    }
  }

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
          const suppressDialog = await shouldSuppressUpdateDialog(currentRelease)
          if (suppressDialog) {
            return result
          }
          let userActed = false
          await blowMention(t('update.new_version_available'), () => {
            return h(AppUpdateView, {
              release: currentRelease as unknown as Record<string, unknown>,
              onUpdateNow: () => {
                userActed = true
                void handleUpdateNowSelection(currentRelease)
              },
              onSkipVersion: () => {
                userActed = true
                void handleIgnoreVersion(currentRelease)
              },
              onRemindLater: () => {
                userActed = true
                void handleRemindLaterSelection(currentRelease)
              }
            })
          })
          if (!userActed) {
            await handleRemindLaterSelection(currentRelease, { silent: true })
          }
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
  async function handleDownloadUpdate(release: GitHubRelease): Promise<boolean> {
    try {
      await appUpdate.downloadUpdate(release)
      toast.success(t('update.download_started'))

      // 可以在这里打开下载中心
      // openDownloadCenter()
      return true
    } catch (err) {
      console.error('[useApplicationUpgrade] Download failed:', err)
      toast.error(
        t('update.download_failed_with_reason', {
          reason: err instanceof Error ? err.message : 'Unknown error'
        })
      )
      return false
    }
  }

  async function installDownloadedUpdate(taskId?: string): Promise<boolean> {
    try {
      await appUpdate.installUpdate(taskId)
      toast.success(t('settings.settingUpdate.messages.installStarted'))
      return true
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('Update request timed out for channel: update:install')
      ) {
        console.warn('[useApplicationUpgrade] Install request ack timeout, treating as started')
        toast.success(t('settings.settingUpdate.messages.installStarted'))
        return true
      }
      console.error('[useApplicationUpgrade] Install update failed:', err)
      toast.error(
        t('settings.settingUpdate.messages.installFailedWithReason', {
          reason: err instanceof Error ? err.message : 'Unknown error'
        })
      )
      return false
    }
  }

  async function handleUpdateNowSelection(release: GitHubRelease): Promise<void> {
    const started = await handleDownloadUpdate(release)
    if (!started) {
      return
    }
    await handleUpdateAcknowledged(release)
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

  async function handleRemindLaterSelection(
    release: GitHubRelease,
    options?: { silent?: boolean }
  ): Promise<void> {
    try {
      await appUpdate.recordAction(release.tag_name, 'remind-later')
      if (!options?.silent) {
        toast.success(t('update.remind_later_success', { hours: 8 }))
      }
      appStates.hasUpdate = false
      appStates.noUpdateAvailable = true
      clearUpdateErrorMessage()
    } catch (err) {
      console.error('[useApplicationUpgrade] Failed to set remind later:', err)
      if (!options?.silent) {
        toast.error(t('update.remind_later_failed'))
      }
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
      toast.success(
        updatedList ? t('update.ignore_version_success') : t('update.skip_version_success')
      )
      appStates.hasUpdate = false
      appStates.noUpdateAvailable = true
      clearUpdateErrorMessage()
    } catch (err) {
      console.error('[useApplicationUpgrade] Failed to ignore version:', err)
      toast.error(t('update.ignore_version_failed'))
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
      return t('update.error.network')
    }
    if (lowerCaseMessage.includes('rate limit')) {
      return t('update.error.rate_limit')
    }
    return t('update.error.generic', { reason: errorMessage })
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
      toast.success(t('settings.settingUpdate.messages.cacheCleared'))
    } catch (err) {
      console.error('[useApplicationUpgrade] Failed to clear cache:', err)
      toast.error(t('settings.settingUpdate.messages.cacheClearFailed'))
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
    if (updateListenerInitialized) {
      return
    }

    try {
      const updateSdk = useUpdateSdk()
      const downloadSdk = useDownloadSdk()

      updateListenerDisposers.push(
        updateSdk.onAvailable((data: UpdateAvailablePayload) => {
          console.log('[useApplicationUpgrade] Received update notification:', data)

          if (data.hasUpdate && data.release) {
            appStates.hasUpdate = true

            const currentRelease = data.release
            void shouldSuppressUpdateDialog(currentRelease).then((suppressDialog) => {
              if (suppressDialog) {
                return
              }
              let userActed = false
              void blowMention(t('update.new_version_available'), () => {
                return h(AppUpdateView, {
                  release: currentRelease as unknown as Record<string, unknown>,
                  onUpdateNow: () => {
                    userActed = true
                    void handleUpdateNowSelection(currentRelease)
                  },
                  onSkipVersion: () => {
                    userActed = true
                    void handleIgnoreVersion(currentRelease)
                  },
                  onRemindLater: () => {
                    userActed = true
                    void handleRemindLaterSelection(currentRelease)
                  }
                })
              }).then(async () => {
                if (!userActed) {
                  await handleRemindLaterSelection(currentRelease, { silent: true })
                }
              })
            })
          }
        }),
        downloadSdk.onTaskCompleted((task) => {
          if (task.module !== DownloadModule.APP_UPDATE) {
            return
          }

          if (completedUpdateTaskIds.has(task.id)) {
            return
          }
          completedUpdateTaskIds.add(task.id)

          const version =
            resolveCompletedTaskVersion(task) || t('settings.settingUpdate.status.unknownVersion')

          toast.success(t('update.update_downloaded'))
          void blowMention(
            t('update.update_ready'),
            t('settings.settingUpdate.status.downloadReady', { version })
          )
        })
      )
      updateListenerInitialized = true
    } catch (error) {
      console.warn('Failed to setup update listener:', error)
      for (const dispose of updateListenerDisposers) {
        try {
          dispose()
        } catch {
          // ignore cleanup errors
        }
      }
      updateListenerDisposers.length = 0
      updateListenerInitialized = false
    }
  }

  return {
    checkApplicationUpgrade,
    handleDownloadUpdate,
    installDownloadedUpdate,
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
