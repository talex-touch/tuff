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
import {
  normalizeStoredUpdateChannel,
  normalizeSupportedUpdateChannel
} from '../update/channel'
import {
  detectUpdateAssetArch,
  detectUpdateAssetPlatform,
  resolveRuntimeUpdateArch
} from '../update/platform-target'
import { devLog } from '~/utils/dev-log'
import { blowMention } from '../mention/dialog-mention'
import { useAppState } from './useAppStates'
import { useStartupInfo } from './useStartupInfo'

type AppVersion = {
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

const CHANNEL_TIMEOUT = 4_000
const INSTALL_TIMEOUT = 10 * 60 * 1000

const updateListenerDisposers: Array<() => void> = []
const completedUpdateTaskIds = new Set<string>()
let updateListenerInitialized = false

function normalizeAssetPlatform(
  platformValue: unknown,
  filename: string
): NormalizedPlatform | null {
  const platform = detectUpdateAssetPlatform(filename, platformValue)
  return platform === 'unsupported' ? null : platform
}

function normalizeAssetArch(archValue: unknown, filename: string): NormalizedArch | null {
  const arch = detectUpdateAssetArch(filename, archValue)
  if (arch === 'x64' || arch === 'arm64') {
    return arch
  }
  if (arch === 'unsupported') {
    return null
  }

  const runtimeArch = resolveRuntimeUpdateArch()
  return runtimeArch === 'x64' || runtimeArch === 'arm64' ? runtimeArch : null
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
      const normalizedPlatform = normalizeAssetPlatform(raw.platform, name)
      const normalizedArch = normalizeAssetArch(raw.arch, name)
      if (!normalizedPlatform || !normalizedArch) {
        devLog(`[useUpdateRuntime][warn] Skip unsupported asset target: ${name}`)
        return null
      }

      const normalized: Record<string, unknown> = {
        name,
        url,
        size,
        platform: normalizedPlatform,
        arch: normalizedArch
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

function resolveVersion(versionString: string): AppVersion {
  const { version, channelLabel } = splitUpdateTag(versionString)
  const channel = resolveUpdateChannelLabel(channelLabel)
  const versionNumArr = version.split('.')

  return {
    channel,
    major: Number.parseInt(versionNumArr[0] || '0', 10),
    minor: Number.parseInt(versionNumArr[1] || '0', 10),
    patch: Number.parseInt(versionNumArr[2] || '0', 10)
  }
}

function normalizeFrequencyLabel(value?: string): UpdateSettings['frequency'] {
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

function getDefaultSettings(channel: AppPreviewChannel): UpdateSettings {
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
    updateChannel: normalizeSupportedUpdateChannel(channel),
    ignoredVersions: [],
    customSources: [],
    autoDownload: false,
    rendererOverrideEnabled: false,
    cacheEnabled: true,
    cacheTTL: 30,
    rateLimitEnabled: true,
    maxRetries: 3,
    retryDelay: 2000,
    lastCheckedAt: null
  }
}

export function useUpdateRuntime() {
  const updateSdk = useUpdateSdk()
  const downloadSdk = useDownloadSdk()
  const { appStates } = useAppState()
  const { t } = useI18nText()
  const { startupInfo, setAppUpdate } = useStartupInfo()
  const loading = ref(false)
  const error = ref<string | null>(null)

  const version = resolveVersion(startupInfo.value?.version || '0.0.0')
  let settingsCache = getDefaultSettings(version.channel)

  async function sendRequest<T>(
    channel: string,
    operation: () => Promise<T>,
    timeout = CHANNEL_TIMEOUT
  ): Promise<T> {
    try {
      return await withTimeout(operation(), timeout)
    } catch (requestError) {
      if (requestError instanceof TimeoutError) {
        throw new Error(`Update request timed out for channel: ${channel}`)
      }
      throw requestError
    }
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

  function handleUpdateError(errorMessage: string, source: string): void {
    console.warn(`[useUpdateRuntime] Update error from ${source}:`, errorMessage)
    appStates.updateErrorMessage = resolveUpdateErrorMessage(errorMessage)
  }

  async function getUpdateSettings(): Promise<UpdateSettings> {
    try {
      const response = await sendRequest('update:get-settings', () => updateSdk.getSettings())
      if (response.success && response.data) {
        const nextSettings = { ...response.data }
        nextSettings.frequency = normalizeFrequencyLabel(nextSettings.frequency)
        nextSettings.updateChannel =
          normalizeStoredUpdateChannel(nextSettings.updateChannel) ?? settingsCache.updateChannel
        if (typeof nextSettings.rendererOverrideEnabled !== 'boolean') {
          nextSettings.rendererOverrideEnabled = false
        }
        settingsCache = nextSettings
      }
      return settingsCache
    } catch (settingsError) {
      console.error('[useUpdateRuntime] Failed to get settings:', settingsError)
      return settingsCache
    }
  }

  async function updateSettings(settings: Partial<UpdateSettings>): Promise<void> {
    const payload: Partial<UpdateSettings> = { ...settings }
    const requestedChannel = normalizeStoredUpdateChannel(payload.updateChannel)
    if ('updateChannel' in payload) {
      payload.updateChannel = requestedChannel
        ? normalizeSupportedUpdateChannel(requestedChannel)
        : settingsCache.updateChannel
    }

    if ('lastCheckedAt' in payload) {
      delete (payload as Record<string, unknown>).lastCheckedAt
    }

    if ('frequency' in payload && payload.frequency) {
      payload.frequency = normalizeFrequencyLabel(payload.frequency)
    }

    const response = await sendRequest('update:update-settings', () =>
      updateSdk.updateSettings(payload)
    )
    if (!response.success) {
      throw new Error(response.error || 'Failed to update settings')
    }
    settingsCache = { ...settingsCache, ...payload }
  }

  async function getUpdateStatus(): Promise<UpdateStatusInfo> {
    const response = await sendRequest('update:get-status', () => updateSdk.getStatus())
    if (response.success && response.data) {
      return {
        ...response.data,
        channel:
          normalizeStoredUpdateChannel(response.data.channel) ?? AppPreviewChannel.RELEASE
      }
    }
    throw new Error(response.error || 'Failed to get status')
  }

  async function getCachedRelease(channel?: AppPreviewChannel): Promise<CachedUpdateRecord | null> {
    try {
      const targetChannel =
        channel === undefined ? undefined : normalizeSupportedUpdateChannel(channel)
      const response = await sendRequest('update:get-cached-release', () =>
        updateSdk.getCachedRelease({ channel: targetChannel })
      )
      if (response.success) {
        if (!response.data) {
          return null
        }
        return {
          ...response.data,
          channel:
            normalizeStoredUpdateChannel(response.data.channel) ?? AppPreviewChannel.RELEASE
        }
      }
      return null
    } catch (cachedError) {
      console.error('[useUpdateRuntime] Failed to get cached release:', cachedError)
      return null
    }
  }

  async function recordAction(tag: string, action: UpdateUserAction): Promise<void> {
    const response = await sendRequest('update:record-action', () =>
      updateSdk.recordAction({ tag, action })
    )
    if (!response.success) {
      throw new Error(response.error || 'Failed to record action')
    }
  }

  async function shouldSuppressUpdateDialog(release: GitHubRelease): Promise<boolean> {
    try {
      const status = await getUpdateStatus()
      if (!status.downloadReady) {
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

  async function checkApplicationUpgrade(force = false): Promise<UpdateCheckResult | undefined> {
    try {
      loading.value = true
      error.value = null

      const response = await sendRequest('update:check', () => updateSdk.check({ force }))
      const result: UpdateCheckResult =
        response.success && response.data
          ? response.data
          : {
              hasUpdate: false,
              error: response.error || 'Update check failed',
              source: 'Unknown'
            }

      devLog('[useUpdateRuntime] Update check result:', result)
      setAppUpdate(result.hasUpdate)

      if (result.hasUpdate && result.release) {
        appStates.hasUpdate = true
        appStates.noUpdateAvailable = false
        clearUpdateErrorMessage()

        const suppressDialog = await shouldSuppressUpdateDialog(result.release)
        if (suppressDialog) {
          return result
        }

        let userActed = false
        await blowMention(t('update.new_version_available'), () => {
          return h(AppUpdateView, {
            release: result.release as unknown as Record<string, unknown>,
            onUpdateNow: () => {
              userActed = true
              void handleUpdateNowSelection(result.release!)
            },
            onSkipVersion: () => {
              userActed = true
              void handleIgnoreVersion(result.release!)
            },
            onRemindLater: () => {
              userActed = true
              void handleRemindLaterSelection(result.release!)
            }
          })
        })

        if (!userActed) {
          await handleRemindLaterSelection(result.release, { silent: true })
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
    } catch (checkError) {
      console.error('[useUpdateRuntime] Update check failed:', checkError)
      error.value = checkError instanceof Error ? checkError.message : 'Unknown error'
      handleUpdateError(error.value, 'Unknown')
      appStates.noUpdateAvailable = false
      return undefined
    } finally {
      loading.value = false
    }
  }

  async function handleDownloadUpdate(release: GitHubRelease): Promise<boolean> {
    try {
      const response = await sendRequest('update:download', () =>
        updateSdk.download(normalizeReleaseForDownload(release))
      )
      if (!response.success) {
        throw new Error(response.error || 'Failed to start update download')
      }
      toast.success(t('update.download_started'))
      return true
    } catch (downloadError) {
      console.error('[useUpdateRuntime] Download failed:', downloadError)
      toast.error(
        t('update.download_failed_with_reason', {
          reason: downloadError instanceof Error ? downloadError.message : 'Unknown error'
        })
      )
      return false
    }
  }

  async function installDownloadedUpdate(taskId?: string): Promise<boolean> {
    try {
      const response = await sendRequest(
        'update:install',
        () => updateSdk.install(taskId ? { taskId } : {}),
        INSTALL_TIMEOUT
      )
      if (!response.success) {
        throw new Error(response.error || 'Failed to install update')
      }
      toast.success(t('settings.settingUpdate.messages.installStarted'))
      return true
    } catch (installError) {
      if (
        installError instanceof Error &&
        installError.message.includes('Update request timed out for channel: update:install')
      ) {
        console.warn('[useUpdateRuntime] Install request ack timeout, treating as started')
        toast.success(t('settings.settingUpdate.messages.installStarted'))
        return true
      }

      console.error('[useUpdateRuntime] Install update failed:', installError)
      toast.error(
        t('settings.settingUpdate.messages.installFailedWithReason', {
          reason: installError instanceof Error ? installError.message : 'Unknown error'
        })
      )
      return false
    }
  }

  async function handleUpdateAcknowledged(release: GitHubRelease): Promise<void> {
    try {
      await recordAction(release.tag_name, 'update-now')
      appStates.hasUpdate = false
      appStates.noUpdateAvailable = false
      clearUpdateErrorMessage()
    } catch (ackError) {
      console.warn('[useUpdateRuntime] Failed to acknowledge update:', ackError)
    }
  }

  async function handleRemindLaterSelection(
    release: GitHubRelease,
    options?: { silent?: boolean }
  ): Promise<void> {
    try {
      await recordAction(release.tag_name, 'remind-later')
      if (!options?.silent) {
        toast.success(t('update.remind_later_success', { hours: 8 }))
      }
      appStates.hasUpdate = false
      appStates.noUpdateAvailable = true
      clearUpdateErrorMessage()
    } catch (remindError) {
      console.error('[useUpdateRuntime] Failed to set remind later:', remindError)
      if (!options?.silent) {
        toast.error(t('update.remind_later_failed'))
      }
    }
  }

  async function handleIgnoreVersion(release: GitHubRelease): Promise<void> {
    try {
      const settings = await getUpdateSettings()
      let updatedList = false
      if (!settings.ignoredVersions.includes(release.tag_name)) {
        const ignoredVersions = [...settings.ignoredVersions, release.tag_name]
        await updateSettings({ ignoredVersions })
        updatedList = true
      }
      await recordAction(release.tag_name, 'skip')
      toast.success(
        updatedList ? t('update.ignore_version_success') : t('update.skip_version_success')
      )
      appStates.hasUpdate = false
      appStates.noUpdateAvailable = true
      clearUpdateErrorMessage()
    } catch (ignoreError) {
      console.error('[useUpdateRuntime] Failed to ignore version:', ignoreError)
      toast.error(t('update.ignore_version_failed'))
    }
  }

  async function handleUpdateNowSelection(release: GitHubRelease): Promise<void> {
    const started = await handleDownloadUpdate(release)
    if (!started) {
      return
    }
    await handleUpdateAcknowledged(release)
  }

  async function clearUpdateCache(): Promise<void> {
    try {
      const response = await sendRequest('update:clear-cache', () => updateSdk.clearCache())
      if (!response.success) {
        throw new Error(response.error || 'Failed to clear cache')
      }
      toast.success(t('settings.settingUpdate.messages.cacheCleared'))
    } catch (cacheError) {
      console.error('[useUpdateRuntime] Failed to clear cache:', cacheError)
      toast.error(t('settings.settingUpdate.messages.cacheClearFailed'))
    }
  }

  function setupUpdateListener(): void {
    if (updateListenerInitialized) {
      return
    }

    try {
      updateListenerDisposers.push(
        updateSdk.onAvailable((data: UpdateAvailablePayload) => {
          devLog('[useUpdateRuntime] Received update notification:', data)

          if (!data.hasUpdate || !data.release) {
            return
          }

          appStates.hasUpdate = true

          void shouldSuppressUpdateDialog(data.release).then((suppressDialog) => {
            if (suppressDialog) {
              return
            }

            let userActed = false
            void blowMention(t('update.new_version_available'), () => {
              return h(AppUpdateView, {
                release: data.release as unknown as Record<string, unknown>,
                onUpdateNow: () => {
                  userActed = true
                  void handleUpdateNowSelection(data.release!)
                },
                onSkipVersion: () => {
                  userActed = true
                  void handleIgnoreVersion(data.release!)
                },
                onRemindLater: () => {
                  userActed = true
                  void handleRemindLaterSelection(data.release!)
                }
              })
            }).then(async () => {
              if (!userActed) {
                await handleRemindLaterSelection(data.release!, { silent: true })
              }
            })
          })
        }),
        downloadSdk.onTaskCompleted((task) => {
          if (task.module !== DownloadModule.APP_UPDATE) {
            return
          }

          if (completedUpdateTaskIds.has(task.id)) {
            return
          }
          completedUpdateTaskIds.add(task.id)

          const versionLabel =
            resolveCompletedTaskVersion(task as DownloadTask) ||
            t('settings.settingUpdate.status.unknownVersion')

          toast.success(t('update.update_downloaded'))
          void blowMention(
            t('update.update_ready'),
            t('settings.settingUpdate.status.downloadReady', { version: versionLabel })
          )
        })
      )
      updateListenerInitialized = true
    } catch (listenerError) {
      console.warn('[useUpdateRuntime] Failed to setup update listener:', listenerError)
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
    loading,
    error,
    checkApplicationUpgrade,
    handleDownloadUpdate,
    installDownloadedUpdate,
    handleIgnoreVersion,
    getUpdateSettings,
    updateSettings,
    clearUpdateCache,
    getUpdateStatus,
    getCachedRelease,
    setupUpdateListener
  }
}
