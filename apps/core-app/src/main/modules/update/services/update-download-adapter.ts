import type { AppPreviewChannel, GitHubRelease } from '@talex-touch/utils'
import type { UpdateSystem } from '../update-system'
import fs from 'node:fs'
import path from 'node:path'
import { DownloadModule, DownloadStatus } from '@talex-touch/utils'
import { and, desc, eq } from 'drizzle-orm'
import { downloadChunks, downloadTasks } from '../../../db/schema'
import { databaseModule } from '../../database'
import type { LogOptions } from '../../../utils/logger'
import type { UpdateTelemetryMeta } from './update-telemetry'

export interface ReadyUpdateStatus {
  downloadReady: boolean
  version: string | null
  taskId: string | null
}

export interface UpdateDownloadAdapterDeps {
  isPackaged: () => boolean
  isMacAutoUpdaterEnabled: () => boolean
  downloadMacUpdate: (release: GitHubRelease) => Promise<void>
  getUpdateSystem: () => UpdateSystem | undefined
  getEffectiveChannel: () => AppPreviewChannel
  getSourceName: () => string
  shouldAutoInstall: () => boolean
  isUpdateCandidate: (version: string) => boolean
  reportTelemetry: (action: string, meta: UpdateTelemetryMeta) => void
  log: {
    info: (message: string, options?: LogOptions) => void
    warn: (message: string, options?: LogOptions) => void
  }
}

/** Bridges update actions to DownloadCenter while retaining download storage ownership. */
export class UpdateDownloadAdapter {
  constructor(private readonly deps: UpdateDownloadAdapterDeps) {}

  async downloadWithCenter(release: GitHubRelease): Promise<{ taskId: string }> {
    const updateSystem = this.requireUpdateSystem()
    return { taskId: await updateSystem.downloadUpdate(release) }
  }

  async downloadWithMacAutoUpdater(release: GitHubRelease): Promise<void> {
    await this.deps.getUpdateSystem()?.scheduleRendererOverride(release)
    await this.deps.downloadMacUpdate(release)
  }

  async installWithCenter(taskId: string): Promise<void> {
    await this.requireUpdateSystem().installUpdate(taskId)
  }

  async maybeAutoDownload(
    release: GitHubRelease,
    trackedDownloads: Map<string, string>
  ): Promise<void> {
    if (!this.deps.isPackaged() || trackedDownloads.has(release.tag_name)) {
      return
    }

    if (this.deps.isMacAutoUpdaterEnabled()) {
      await this.downloadMacAutomatically(release, trackedDownloads)
      return
    }

    const updateSystem = this.deps.getUpdateSystem()
    if (!updateSystem) {
      return
    }

    const existingTaskId = await this.getExistingDownloadedUpdateTaskId(release.tag_name)
    if (existingTaskId) {
      trackedDownloads.set(release.tag_name, existingTaskId)
      this.deps.log.info(`Update ${release.tag_name} already downloaded, skipping auto download`, {
        meta: { taskId: existingTaskId }
      })
      return
    }

    try {
      const taskId = await updateSystem.downloadUpdate(release, {
        autoInstallOnComplete: this.deps.shouldAutoInstall()
      })
      trackedDownloads.set(release.tag_name, taskId)
      this.deps.log.info(`Auto download started for ${release.tag_name}`, { meta: { taskId } })
      this.deps.reportTelemetry('download_started', {
        channel: this.deps.getEffectiveChannel(),
        source: this.deps.getSourceName(),
        tag: release.tag_name,
        taskId,
        itemKind: 'auto'
      })
    } catch (error) {
      this.deps.log.warn('Auto download failed', { error, meta: { tag: release.tag_name } })
      this.deps.reportTelemetry('download_error', {
        channel: this.deps.getEffectiveChannel(),
        source: this.deps.getSourceName(),
        tag: release.tag_name,
        itemKind: 'auto'
      })
    }
  }

  async resolveReadyUpdateStatus(macReadyVersion: string | null): Promise<ReadyUpdateStatus> {
    if (macReadyVersion) {
      return { downloadReady: true, version: macReadyVersion, taskId: null }
    }

    try {
      const tasks = await databaseModule
        .getDb()
        .select({
          id: downloadTasks.id,
          destination: downloadTasks.destination,
          filename: downloadTasks.filename,
          metadata: downloadTasks.metadata
        })
        .from(downloadTasks)
        .where(
          and(
            eq(downloadTasks.module, DownloadModule.APP_UPDATE),
            eq(downloadTasks.status, DownloadStatus.COMPLETED)
          )
        )
        .orderBy(desc(downloadTasks.completedAt))
        .limit(20)

      for (const task of tasks) {
        const filePath = path.join(task.destination, task.filename)
        if (!(await this.fileExists(filePath))) {
          continue
        }
        const metadata = this.parseTaskMetadata(task.metadata)
        const version = typeof metadata?.version === 'string' ? metadata.version : null
        if (version && !this.deps.isUpdateCandidate(version)) {
          await this.cleanupOutdatedTask(task.id, filePath, version)
          continue
        }
        return { downloadReady: true, version, taskId: task.id }
      }
    } catch (error) {
      this.deps.log.warn('Failed to resolve ready update status', { error })
    }

    return { downloadReady: false, version: null, taskId: null }
  }

  private requireUpdateSystem(): UpdateSystem {
    const updateSystem = this.deps.getUpdateSystem()
    if (!updateSystem) {
      throw new Error('UpdateSystem not initialized')
    }
    return updateSystem
  }

  private async downloadMacAutomatically(
    release: GitHubRelease,
    trackedDownloads: Map<string, string>
  ): Promise<void> {
    try {
      await this.downloadWithMacAutoUpdater(release)
      trackedDownloads.set(release.tag_name, 'macos-auto-updater')
      this.deps.log.info(`Auto download started for ${release.tag_name} (macOS autoUpdater)`)
      this.deps.reportTelemetry('download_started', {
        channel: this.deps.getEffectiveChannel(),
        source: 'mac-auto-updater',
        tag: release.tag_name,
        itemKind: 'auto'
      })
    } catch (error) {
      this.deps.log.warn('Auto download failed (macOS autoUpdater)', {
        error,
        meta: { tag: release.tag_name }
      })
      this.deps.reportTelemetry('download_error', {
        channel: this.deps.getEffectiveChannel(),
        source: 'mac-auto-updater',
        tag: release.tag_name,
        itemKind: 'auto'
      })
    }
  }

  private async getExistingDownloadedUpdateTaskId(tag: string): Promise<string | null> {
    try {
      const tasks = await databaseModule
        .getDb()
        .select({
          id: downloadTasks.id,
          destination: downloadTasks.destination,
          filename: downloadTasks.filename,
          metadata: downloadTasks.metadata
        })
        .from(downloadTasks)
        .where(
          and(
            eq(downloadTasks.module, DownloadModule.APP_UPDATE),
            eq(downloadTasks.status, DownloadStatus.COMPLETED)
          )
        )
        .orderBy(desc(downloadTasks.completedAt))
        .limit(20)

      for (const task of tasks) {
        if (this.parseTaskMetadata(task.metadata)?.version !== tag) {
          continue
        }
        if (await this.fileExists(path.join(task.destination, task.filename))) {
          return task.id
        }
      }
    } catch (error) {
      this.deps.log.warn('Failed to check existing update downloads', { error, meta: { tag } })
    }
    return null
  }

  private async cleanupOutdatedTask(
    taskId: string,
    filePath: string,
    version: string
  ): Promise<void> {
    try {
      await fs.promises.unlink(filePath)
    } catch (error) {
      this.deps.log.warn('Failed to delete outdated update file', {
        error,
        meta: { taskId, filePath, version }
      })
    }

    try {
      const db = databaseModule.getDb()
      await db.delete(downloadChunks).where(eq(downloadChunks.taskId, taskId))
      await db.delete(downloadTasks).where(eq(downloadTasks.id, taskId))
      this.deps.log.info('Outdated update package cleaned', { meta: { taskId, version } })
    } catch (error) {
      this.deps.log.warn('Failed to delete outdated update task record', {
        error,
        meta: { taskId, version }
      })
    }
  }

  private parseTaskMetadata(metadata?: string | null): Record<string, unknown> | null {
    if (!metadata) {
      return null
    }
    try {
      return JSON.parse(metadata) as Record<string, unknown>
    } catch (error) {
      this.deps.log.warn('Failed to parse download task metadata', { error })
      return null
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.stat(filePath)
      return true
    } catch {
      return false
    }
  }
}
