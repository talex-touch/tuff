import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type * as schema from '../../db/schema'

import { readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { desc, sql } from 'drizzle-orm'
import { app } from 'electron'
import { genTouchChannel } from '../../core/channel-core'
import { config, scanProgress } from '../../db/schema'
import { BaseModule } from '../abstract-base-module'
import { fileProvider } from '../box-tool/addon/files/file-provider'
import { databaseModule } from '../database'
import { ocrService } from '../ocr/ocr-service'
import { activeAppService } from './active-app'
import { createLogger } from '../../utils/logger'

const dashboardLog = createLogger('TuffDashboard')

interface TuffDashboardOptions {
  limit?: number
}

export class TuffDashboardModule extends BaseModule {
  static key: symbol = Symbol.for('TuffDashboard')
  name: ModuleKey = TuffDashboardModule.key

  private db: LibSQLDatabase<typeof schema> | null = null

  constructor() {
    super(TuffDashboardModule.key, {
      create: false,
      dirName: 'system',
    })
  }

  async onInit(_ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const channel = genTouchChannel()

    channel.regChannel(ChannelType.MAIN, 'tuff:dashboard', async ({ reply, data }) => {
      try {
        const options: TuffDashboardOptions = (data ?? {}) as TuffDashboardOptions
        const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 50
        const snapshot = await this.buildSnapshot(limit)
        reply(DataCode.SUCCESS, {
          ok: true,
          snapshot,
        })
      }
      catch (error) {
        dashboardLog.error('Failed to build snapshot', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    dashboardLog.success('Channel handler registered successfully')
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): void {
    this.db = null
  }

  private toIso(value: unknown): string | null {
    if (!value)
      return null
    if (typeof value === 'string') {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
    }
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (typeof value === 'number') {
      return new Date(value).toISOString()
    }
    return null
  }

  private async buildSnapshot(limit: number) {
    const [indexing, ocr, configOverview, logs, applications, workers] = await Promise.all([
      this.buildIndexingSection(limit),
      ocrService.getDashboardSnapshot(Math.min(limit, 100)),
      this.buildConfigOverview(Math.min(limit, 100)),
      this.buildLogOverview(Math.min(limit, 20)),
      this.buildApplicationSection(),
      this.buildWorkerSection(),
    ])

    return {
      panelName: '详细信息',
      generatedAt: new Date().toISOString(),
      system: this.buildSystemOverview(),
      indexing,
      ocr,
      config: configOverview,
      logs,
      applications,
      workers,
    }
  }

  private buildSystemOverview() {
    return {
      version: app.getVersion(),
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      uptime: os.uptime(),
      memory: {
        free: os.freemem(),
        total: os.totalmem(),
      },
    }
  }

  private async buildApplicationSection() {
    const activeApp = await activeAppService.getActiveApp(false)
    const rawMetrics = app.getAppMetrics()
    const metrics = rawMetrics
      .slice(0, 10)
      .map(metric => ({
        pid: metric.pid,
        type: metric.type,
        cpu: metric.cpu?.percentCPUUsage ?? null,
        memory: metric.memory?.workingSetSize ?? null,
        created: metric.creationTime ? this.toIso(metric.creationTime) : null,
      }))

    const totals = rawMetrics.reduce(
      (acc, metric) => {
        acc.cpu += metric.cpu?.percentCPUUsage ?? 0
        acc.memory += metric.memory?.workingSetSize ?? 0
        return acc
      },
      { cpu: 0, memory: 0 },
    )

    return {
      activeApp: activeApp
        ? {
            ...activeApp,
            lastUpdated: this.toIso(activeApp.lastUpdated),
          }
        : null,
      summary: {
        cpu: totals.cpu,
        memory: totals.memory,
        processCount: rawMetrics.length,
      },
      metrics,
    }
  }

  private async buildIndexingSection(limit: number) {
    const db = this.ensureDb()

    const [progress, scanRows] = await Promise.all([
      fileProvider.getIndexingProgress(),
      db
        ? db.select().from(scanProgress).orderBy(desc(scanProgress.lastScanned)).limit(limit)
        : Promise.resolve([]),
    ])

    const scanOverview = Array.isArray(scanRows)
      ? scanRows.map(row => ({
          path: row.path ?? '',
          lastScanned: this.toIso(row.lastScanned),
        }))
      : []

    const entries = progress.entries.map(entry => ({
      path: entry.path,
      status: entry.status,
      progress: entry.progress,
      processedBytes: entry.processedBytes,
      totalBytes: entry.totalBytes,
      updatedAt: this.toIso(entry.updatedAt),
      lastError: entry.lastError,
    }))

    return {
      summary: progress.summary,
      watchedPaths: fileProvider.getWatchedPaths(),
      entries,
      scanProgress: scanOverview,
    }
  }

  private async buildConfigOverview(limit: number) {
    const db = this.ensureDb()

    if (!db) {
      return {
        total: 0,
        entries: [] as Array<{ key: string, value: unknown }>,
      }
    }

    const [rows, totalRow] = await Promise.all([
      db.select().from(config).orderBy(config.key).limit(limit),
      db
        .select({ total: sql<number>`COUNT(*)` })
        .from(config)
        .limit(1),
    ])

    const entries = rows.map((row) => {
      let parsed: unknown = row.value
      if (typeof row.value === 'string') {
        try {
          parsed = JSON.parse(row.value)
        }
        catch {
          parsed = row.value
        }
      }
      return {
        key: row.key ?? '',
        value: parsed,
      }
    })

    return {
      total: totalRow.length > 0 ? Number(totalRow[0].total ?? 0) : entries.length,
      entries,
    }
  }

  private async buildLogOverview(limit: number) {
    const logsDir = app.getPath('logs')
    const userDataDir = app.getPath('userData')
    let recentFiles: Array<{ name: string, size: number, updatedAt: string | null }> = []

    try {
      const dirents = await readdir(logsDir, { withFileTypes: true })
      const files = dirents.filter(dirent => dirent.isFile())
      const detailed = await Promise.all(
        files.map(async (file) => {
          const fullPath = path.join(logsDir, file.name)
          try {
            const stats = await stat(fullPath)
            return {
              name: file.name,
              size: stats.size,
              updatedAt: this.toIso(stats.mtime),
            }
          }
          catch (error) {
            dashboardLog.warn('Failed to stat log file', { error, meta: { path: fullPath } })
            return null
          }
        }),
      )
      recentFiles = detailed
        .filter(
          (entry): entry is { name: string, size: number, updatedAt: string | null } =>
            entry !== null,
        )
        .sort((a, b) => {
          const left = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
          const right = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
          return right - left
        })
        .slice(0, limit)
    }
    catch (error) {
      dashboardLog.warn('Failed to read logs directory', { error, meta: { dir: logsDir } })
    }

    return {
      directory: logsDir,
      userDataDir,
      recentFiles,
    }
  }

  private async buildWorkerSection() {
    try {
      return await fileProvider.getWorkerStatusSnapshot()
    }
    catch (error) {
      dashboardLog.warn('Failed to load worker status snapshot', { error })
      return {
        summary: { total: 0, busy: 0, idle: 0, offline: 0 },
        workers: [],
      }
    }
  }

  private ensureDb(): LibSQLDatabase<typeof schema> | null {
    if (this.db)
      return this.db
    try {
      this.db = databaseModule.getDb()
    }
    catch (error) {
      dashboardLog.warn('Database not ready yet, returning partial snapshot', { error })
      return null
    }
    return this.db
  }
}

export const tuffDashboardModule = new TuffDashboardModule()
