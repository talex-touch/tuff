import type {
  CachedUpdateRecord,
  GitHubRelease,
  UpdateCheckResult,
  UpdateLifecycleSnapshot,
  UpdateSettings,
  UpdateUserAction
} from '@talex-touch/utils'
import {
  AppPreviewChannel,
  resolveUpdateChannelLabel,
  shouldAcceptUpdateLifecycleSnapshot,
  splitUpdateTag,
  UPDATE_GITHUB_RELEASES_API,
  UpdateProviderType
} from '@talex-touch/utils'
import { TimeoutError, withTimeout } from '@talex-touch/utils/common/utils/time'
import { isMainWindow, useUpdateSdk } from '@talex-touch/utils/renderer'
import { h, readonly, ref, shallowRef } from 'vue'
import { toast } from 'vue-sonner'
import AppUpdateView from '~/components/base/AppUpgradationView.vue'
import { useI18nText } from '~/modules/lang'
import { devLog } from '~/utils/dev-log'
import { createRendererLogger } from '~/utils/renderer-log'
import { blowMention } from '../mention/dialog-mention'
import { normalizeStoredUpdateChannel, normalizeSupportedUpdateChannel } from '../update/channel'
import { updateDialogSession } from '../update/update-dialog-session'
import { useAppState } from './useAppStates'
import { useStartupInfo } from './useStartupInfo'

interface AppVersion {
  channel: AppPreviewChannel
  major: number
  minor: number
  patch: number
}

const CHANNEL_TIMEOUT = 4_000
const INSTALL_TIMEOUT = 10 * 60 * 1000

const updateListenerDisposers: Array<() => void> = []
let updateListenerInitialized = false
const updateRuntimeLog = createRendererLogger('useUpdateRuntime')
const lifecycleSnapshotState = shallowRef<UpdateLifecycleSnapshot | null>(null)
const lifecycleSnapshot = readonly(lifecycleSnapshotState)

function acceptUpdateLifecycleSnapshot(snapshot: UpdateLifecycleSnapshot): UpdateLifecycleSnapshot {
  const current = lifecycleSnapshotState.value
  if (!shouldAcceptUpdateLifecycleSnapshot(current, snapshot)) {
    return current ?? snapshot
  }
  lifecycleSnapshotState.value = snapshot
  return snapshot
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
    autoDownload: true,
    installOnNormalQuit: true,
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
  const { appStates } = useAppState()
  const { t } = useI18nText()
  const { startupInfo, setAppUpdate } = useStartupInfo()
  const loading = ref(false)
  const error = ref<string | null>(null)

  const version = resolveVersion(startupInfo.value?.version || '0.0.0')
  let settingsCache = getDefaultSettings(version.channel)

  function canShowUpdatePrompt(): boolean {
    return isMainWindow()
  }

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
    updateRuntimeLog.warn(`Update error from ${source}:`, errorMessage)
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
        if (typeof nextSettings.installOnNormalQuit !== 'boolean') {
          nextSettings.installOnNormalQuit = true
        }
        settingsCache = nextSettings
      }
      return settingsCache
    } catch (settingsError) {
      updateRuntimeLog.error('Failed to get settings', settingsError)
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
    if (response.snapshot) {
      acceptUpdateLifecycleSnapshot(response.snapshot)
    }
    if (!response.success) {
      throw new Error(response.error || 'Failed to update settings')
    }
    settingsCache = { ...settingsCache, ...payload }
  }

  async function getUpdateStatus(): Promise<UpdateLifecycleSnapshot> {
    const response = await sendRequest('update:get-status', () => updateSdk.getStatus())
    if (response.success && response.data) {
      return acceptUpdateLifecycleSnapshot({
        ...response.data,
        channel: normalizeStoredUpdateChannel(response.data.channel) ?? AppPreviewChannel.RELEASE
      })
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
          channel: normalizeStoredUpdateChannel(response.data.channel) ?? AppPreviewChannel.RELEASE
        }
      }
      return null
    } catch (cachedError) {
      updateRuntimeLog.error('Failed to get cached release', cachedError)
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

  async function shouldSuppressUpdateDialog(
    release: GitHubRelease,
    options?: { force?: boolean }
  ): Promise<boolean> {
    try {
      const status = await getUpdateStatus()
      if (
        status.targetVersion === release.tag_name &&
        (status.phase === 'downloading' ||
          status.phase === 'verifying' ||
          status.phase === 'ready' ||
          status.phase === 'install-scheduled' ||
          status.phase === 'handoff-started' ||
          status.phase === 'awaiting-health')
      ) {
        return true
      }
    } catch {
      // ignore
    }

    if (options?.force) {
      return false
    }

    try {
      const releaseChannel = normalizeSupportedUpdateChannel(
        resolveVersion(release.tag_name).channel
      )
      const cachedRelease = await getCachedRelease(releaseChannel)
      if (!cachedRelease || cachedRelease.tag !== release.tag_name) {
        return false
      }

      if (cachedRelease.status === 'skipped' || cachedRelease.status === 'acknowledged') {
        return true
      }

      if (
        cachedRelease.status === 'snoozed' &&
        typeof cachedRelease.snoozeUntil === 'number' &&
        cachedRelease.snoozeUntil > Date.now()
      ) {
        return true
      }
    } catch {
      // ignore
    }

    return false
  }

  async function finalizeDialogAction(
    tag: string,
    action: () => Promise<boolean>
  ): Promise<boolean> {
    try {
      const success = await action()
      updateDialogSession.finishAction(tag, success)
      return success
    } catch (dialogActionError) {
      updateRuntimeLog.error('Update dialog action failed', dialogActionError)
      updateDialogSession.failAction(tag)
      return false
    }
  }

  async function presentUpdateDialog(
    release: GitHubRelease,
    options?: { bypassSuppression?: boolean }
  ): Promise<boolean> {
    if (!canShowUpdatePrompt()) {
      return false
    }

    const tag = release.tag_name
    if (!updateDialogSession.beginPresentation(tag, options)) {
      return false
    }

    let actionStarted = false
    let actionPromise: Promise<boolean> | null = null

    const startAction = (action: () => Promise<boolean>): void => {
      if (actionStarted) {
        return
      }
      if (!updateDialogSession.beginAction(tag)) {
        return
      }
      actionStarted = true
      actionPromise = finalizeDialogAction(tag, action)
    }

    try {
      await blowMention(t('update.new_version_available'), () => {
        return h(AppUpdateView, {
          release: release as unknown as Record<string, unknown>,
          onUpdateNow: () => {
            startAction(() => handleUpdateNowSelection(release))
          },
          onSkipVersion: () => {
            startAction(() => handleIgnoreVersion(release))
          },
          onRemindLater: () => {
            startAction(() => handleRemindLaterSelection(release))
          }
        })
      })
    } finally {
      if (!actionStarted) {
        if (updateDialogSession.beginAction(tag)) {
          actionStarted = true
          actionPromise = finalizeDialogAction(tag, () =>
            handleRemindLaterSelection(release, { silent: true })
          )
        } else {
          updateDialogSession.endPresentation(tag)
        }
      }
    }

    if (actionPromise) {
      await actionPromise
    }

    return true
  }

  async function checkApplicationUpgrade(force = false): Promise<UpdateCheckResult | undefined> {
    if (!canShowUpdatePrompt()) {
      return undefined
    }

    try {
      loading.value = true
      error.value = null

      const response = await sendRequest('update:check', () => updateSdk.check({ force }))
      if (response.snapshot) {
        acceptUpdateLifecycleSnapshot(response.snapshot)
      }
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

        const updateSettings = await getUpdateSettings()
        if (updateSettings.autoDownload && !force) {
          return result
        }

        const suppressDialog = await shouldSuppressUpdateDialog(result.release, { force })
        if (suppressDialog) {
          return result
        }

        await presentUpdateDialog(result.release, { bypassSuppression: force })
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
      updateRuntimeLog.error('Update check failed', checkError)
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
        updateSdk.download({ tag: release.tag_name })
      )
      if (response.snapshot) {
        acceptUpdateLifecycleSnapshot(response.snapshot)
      }
      if (!response.success) {
        throw new Error(response.error || 'Failed to start update download')
      }
      toast.success(t('update.download_started'))
      return true
    } catch (downloadError) {
      updateRuntimeLog.error('Download failed', downloadError)
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
      if (response.snapshot) {
        acceptUpdateLifecycleSnapshot(response.snapshot)
      }
      if (!response.success) {
        const reason =
          response.errorCode === 'MAC_UPDATE_DESTINATION_NOT_WRITABLE'
            ? t('settings.settingUpdate.messages.macSilentUpdateNotWritable')
            : response.errorCode === 'MAC_UPDATE_BUILD_UNTRUSTED'
              ? t('settings.settingUpdate.messages.macSilentUpdateUntrusted')
              : response.error || 'Failed to install update'
        throw new Error(reason)
      }
      toast.success(t('settings.settingUpdate.messages.installStarted'))
      return true
    } catch (installError) {
      if (
        installError instanceof Error &&
        installError.message.includes('Update request timed out for channel: update:install')
      ) {
        updateRuntimeLog.warn('Install request ack timeout, waiting for main-process handoff')
        toast.info(t('settings.settingUpdate.messages.installPendingConfirmation'))
        return false
      }

      updateRuntimeLog.error('Install update failed', installError)
      toast.error(
        t('settings.settingUpdate.messages.installFailedWithReason', {
          reason: installError instanceof Error ? installError.message : 'Unknown error'
        })
      )
      return false
    }
  }

  async function handleUpdateAcknowledged(release: GitHubRelease): Promise<boolean> {
    try {
      await recordAction(release.tag_name, 'update-now')
      appStates.hasUpdate = false
      appStates.noUpdateAvailable = false
      clearUpdateErrorMessage()
      return true
    } catch (ackError) {
      updateRuntimeLog.warn('Failed to acknowledge update', ackError)
      return false
    }
  }

  async function handleRemindLaterSelection(
    release: GitHubRelease,
    options?: { silent?: boolean }
  ): Promise<boolean> {
    try {
      await recordAction(release.tag_name, 'remind-later')
      if (!options?.silent) {
        toast.success(t('update.remind_later_success', { hours: 8 }))
      }
      appStates.hasUpdate = false
      appStates.noUpdateAvailable = true
      clearUpdateErrorMessage()
      return true
    } catch (remindError) {
      updateRuntimeLog.error('Failed to set remind later', remindError)
      if (!options?.silent) {
        toast.error(t('update.remind_later_failed'))
      }
      return false
    }
  }

  async function handleIgnoreVersion(release: GitHubRelease): Promise<boolean> {
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
      return true
    } catch (ignoreError) {
      updateRuntimeLog.error('Failed to ignore version', ignoreError)
      toast.error(t('update.ignore_version_failed'))
      return false
    }
  }

  async function handleUpdateNowSelection(release: GitHubRelease): Promise<boolean> {
    const started = await handleDownloadUpdate(release)
    if (!started) {
      return false
    }
    await handleUpdateAcknowledged(release)
    return true
  }

  async function clearUpdateCache(): Promise<void> {
    try {
      const response = await sendRequest('update:clear-cache', () => updateSdk.clearCache())
      if (response.snapshot) {
        acceptUpdateLifecycleSnapshot(response.snapshot)
      }
      if (!response.success) {
        throw new Error(response.error || 'Failed to clear cache')
      }
      toast.success(t('settings.settingUpdate.messages.cacheCleared'))
    } catch (cacheError) {
      updateRuntimeLog.error('Failed to clear cache', cacheError)
      toast.error(t('settings.settingUpdate.messages.cacheClearFailed'))
    }
  }

  function setupUpdateListener(): void {
    if (!canShowUpdatePrompt()) {
      return
    }

    if (updateListenerInitialized) {
      return
    }

    try {
      updateListenerDisposers.push(
        updateSdk.onLifecycleChanged((snapshot) => {
          acceptUpdateLifecycleSnapshot(snapshot)
        }),
        updateSdk.onAvailable((data) => {
          devLog('[useUpdateRuntime] Received update notification:', data)
          const snapshot = acceptUpdateLifecycleSnapshot(data.snapshot)
          if (
            snapshot.attemptId !== data.snapshot.attemptId ||
            snapshot.revision !== data.snapshot.revision ||
            snapshot.releaseTag !== data.release?.tag_name
          ) {
            return
          }

          if (!data.hasUpdate || !data.release) {
            return
          }

          appStates.hasUpdate = true

          void getUpdateSettings().then((settings) => {
            if (settings.autoDownload) {
              return
            }
            return shouldSuppressUpdateDialog(data.release!).then((suppressDialog) => {
              if (!suppressDialog) {
                void presentUpdateDialog(data.release!)
              }
            })
          })
        })
      )
      updateListenerInitialized = true
    } catch (listenerError) {
      updateRuntimeLog.warn('Failed to setup update listener', listenerError)
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
    lifecycleSnapshot,
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
