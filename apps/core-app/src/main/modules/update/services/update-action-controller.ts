import type { AppPreviewChannel, GitHubRelease, UpdateCheckResult } from '@talex-touch/utils'
import type { UpdateTelemetryMeta } from './update-telemetry'

export interface UpdateActionControllerDeps {
  isPackaged: () => boolean
  getEffectiveChannel: () => AppPreviewChannel
  getQuickUpdateCheckResult: (channel: AppPreviewChannel) => Promise<UpdateCheckResult>
  queueBackgroundUpdateCheck: () => void
  checkForUpdates: (force: boolean) => Promise<UpdateCheckResult>
  withDownloadCenterDownload: (release: GitHubRelease) => Promise<{ taskId: string }>
  withDownloadCenterInstall: (taskId: string) => Promise<void>
  reportUpdateMessage: (
    level: 'info' | 'warn' | 'error',
    title: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void
  reportUpdateTelemetry: (action: string, meta: UpdateTelemetryMeta) => void
  reportUpdateError: (action: string, error: unknown, meta?: Record<string, unknown>) => string
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
        error: this.deps.reportUpdateError('check', error, {
          channel: this.deps.getEffectiveChannel()
        })
      }
    }
  }

  async handleDownload(
    release: GitHubRelease
  ): Promise<{ success: boolean; data?: { taskId: string }; error?: string }> {
    try {
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
      const publicMessage = this.deps.reportUpdateError('download', error, {
        tag: release?.tag_name,
        channel: this.deps.getEffectiveChannel()
      })
      this.deps.reportUpdateTelemetry('download_error', {
        channel: this.deps.getEffectiveChannel(),
        source: this.deps.getSourceName(),
        tag: release?.tag_name,
        itemKind: 'manual'
      })
      return { success: false, error: publicMessage }
    }
  }

  async handleInstall(payload?: {
    taskId?: string
  }): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    if (!payload?.taskId) {
      this.deps.reportUpdateTelemetry('install_error', {
        channel: this.deps.getEffectiveChannel(),
        source: this.deps.getSourceName(),
        itemKind: 'manual'
      })
      return { success: false, error: 'Missing update task id', errorCode: 'UPDATE_TASK_REQUIRED' }
    }
    try {
      await this.deps.withDownloadCenterInstall(payload.taskId)
      this.deps.reportUpdateMessage('info', 'Update install scheduled', payload.taskId, {
        channel: this.deps.getEffectiveChannel()
      })
      this.deps.reportUpdateTelemetry('install_scheduled', {
        channel: this.deps.getEffectiveChannel(),
        source: this.deps.getSourceName(),
        taskId: payload.taskId,
        itemKind: 'manual'
      })
      return { success: true }
    } catch (error) {
      this.deps.logError('Failed to install update', error)
      const publicMessage = this.deps.reportUpdateError('install', error, {
        channel: this.deps.getEffectiveChannel(),
        taskId: payload.taskId
      })
      const errorCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : undefined
      this.deps.reportUpdateTelemetry('install_error', {
        channel: this.deps.getEffectiveChannel(),
        source: this.deps.getSourceName(),
        taskId: payload.taskId,
        itemKind: 'manual'
      })
      return { success: false, error: publicMessage, errorCode }
    }
  }
}
