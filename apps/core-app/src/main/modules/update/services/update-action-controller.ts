import type { AppPreviewChannel, GitHubRelease, UpdateCheckResult } from '@talex-touch/utils'

export interface UpdateActionControllerDeps {
  isPackaged: () => boolean
  getEffectiveChannel: () => AppPreviewChannel
  getQuickUpdateCheckResult: (channel: AppPreviewChannel) => Promise<UpdateCheckResult>
  queueBackgroundUpdateCheck: () => void
  checkForUpdates: (force: boolean) => Promise<UpdateCheckResult>
  isMacAutoUpdaterEnabled: () => boolean
  withDownloadCenterDownload: (release: GitHubRelease) => Promise<{ taskId: string }>
  withMacDownload: (release: GitHubRelease) => Promise<void>
  withDownloadCenterInstall: (taskId: string) => Promise<void>
  withMacInstall: () => Promise<void>
  reportUpdateMessage: (
    level: 'info' | 'warn' | 'error',
    title: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void
  reportUpdateTelemetry: (action: string, meta: Record<string, unknown>) => void
  reportUpdateError: (action: string, error: unknown, meta?: Record<string, unknown>) => void
  getSourceName: () => string
  logError: (message: string, error: unknown) => void
}

export class UpdateActionController {
  constructor(private readonly deps: UpdateActionControllerDeps) {}

  async handleCheck(
    force: boolean
  ): Promise<{ success: boolean; data?: UpdateCheckResult; error?: string }> {
    try {
      const channel = this.deps.getEffectiveChannel()

      if (!force) {
        const quickResult = await this.deps.getQuickUpdateCheckResult(channel)
        if (this.deps.isPackaged()) {
          this.deps.queueBackgroundUpdateCheck()
        }
        return { success: true, data: quickResult }
      }

      const result = await this.deps.checkForUpdates(true)
      return { success: true, data: result }
    } catch (error) {
      this.deps.logError('Update check failed', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async handleDownload(
    release: GitHubRelease
  ): Promise<{ success: boolean; data?: { taskId: string }; error?: string }> {
    try {
      if (this.deps.isMacAutoUpdaterEnabled()) {
        await this.deps.withMacDownload(release)
        this.deps.reportUpdateMessage('info', 'Update download started', release.tag_name, {
          channel: this.deps.getEffectiveChannel(),
          source: 'mac-auto-updater'
        })
        this.deps.reportUpdateTelemetry('download_started', {
          channel: this.deps.getEffectiveChannel(),
          source: 'mac-auto-updater',
          tag: release.tag_name,
          itemKind: 'manual'
        })
        return { success: true }
      }

      const { taskId } = await this.deps.withDownloadCenterDownload(release)
      this.deps.reportUpdateMessage('info', 'Update download started', release.tag_name, {
        channel: this.deps.getEffectiveChannel(),
        taskId
      })
      this.deps.reportUpdateTelemetry('download_started', {
        channel: this.deps.getEffectiveChannel(),
        source: this.deps.getSourceName(),
        tag: release.tag_name,
        taskId,
        itemKind: 'manual'
      })
      return { success: true, data: { taskId } }
    } catch (error) {
      this.deps.logError('Failed to download update', error)
      this.deps.reportUpdateError('download', error, {
        tag: release?.tag_name,
        channel: this.deps.getEffectiveChannel()
      })
      this.deps.reportUpdateTelemetry('download_error', {
        channel: this.deps.getEffectiveChannel(),
        source: this.deps.isMacAutoUpdaterEnabled()
          ? 'mac-auto-updater'
          : this.deps.getSourceName(),
        tag: release?.tag_name,
        itemKind: 'manual'
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async handleInstall(payload?: {
    taskId?: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.deps.isMacAutoUpdaterEnabled()) {
        await this.deps.withMacInstall()
        this.deps.reportUpdateMessage('info', 'Update install triggered', 'mac-auto-updater', {
          channel: this.deps.getEffectiveChannel()
        })
        this.deps.reportUpdateTelemetry('install_started', {
          channel: this.deps.getEffectiveChannel(),
          source: 'mac-auto-updater',
          itemKind: 'manual'
        })
        return { success: true }
      }

      if (!payload?.taskId) {
        throw new Error('Missing update task id')
      }
      await this.deps.withDownloadCenterInstall(payload.taskId)
      this.deps.reportUpdateMessage('info', 'Update install triggered', payload.taskId, {
        channel: this.deps.getEffectiveChannel()
      })
      this.deps.reportUpdateTelemetry('install_started', {
        channel: this.deps.getEffectiveChannel(),
        source: this.deps.getSourceName(),
        taskId: payload.taskId,
        itemKind: 'manual'
      })
      return { success: true }
    } catch (error) {
      this.deps.logError('Failed to install update', error)
      this.deps.reportUpdateError('install', error, {
        channel: this.deps.getEffectiveChannel(),
        taskId: payload?.taskId
      })
      this.deps.reportUpdateTelemetry('install_error', {
        channel: this.deps.getEffectiveChannel(),
        source: this.deps.isMacAutoUpdaterEnabled()
          ? 'mac-auto-updater'
          : this.deps.getSourceName(),
        taskId: payload?.taskId,
        itemKind: 'manual'
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
