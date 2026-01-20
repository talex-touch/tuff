import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type * as schema from '../../db/schema'

import { readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { desc, sql } from 'drizzle-orm'
import { app } from 'electron'
import { genTouchApp } from '../../core'
import { config, scanProgress } from '../../db/schema'
import { createLogger } from '../../utils/logger'
import { appendWorkflowDebugLog } from '../../utils/workflow-debug'
import { BaseModule } from '../abstract-base-module'
import { fileProvider } from '../box-tool/addon/files/file-provider'
import { databaseModule } from '../database'
import { ocrService } from '../ocr/ocr-service'
import { activeAppService } from './active-app'

const dashboardLog = createLogger('TuffDashboard')

const tuffDashboardEvent = defineRawEvent<
  TuffDashboardOptions | undefined,
  {
    ok: boolean
    snapshot?: unknown
    error?: string
  }
>('tuff:dashboard')

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
      dirName: 'system'
    })
  }

  async onInit(_ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const channel = genTouchApp().channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel as any, keyManager as any)

    transport.on(tuffDashboardEvent, async (options) => {
      const requestId = null
      const requestStartedAt = performance.now()
      try {
        const payload: TuffDashboardOptions = (options ?? {}) as TuffDashboardOptions
        const limit = typeof payload.limit === 'number' && payload.limit > 0 ? payload.limit : 50
        appendWorkflowDebugLog({
          hid: 'H1',
          loc: 'tuff-dashboard.handler',
          msg: 'request.start',
          data: { requestId, limit }
        })
        const snapshot = await this.buildSnapshot(limit, requestId)
        return {
          ok: true,
          snapshot
        }
      } catch (error) {
        dashboardLog.error('Failed to build snapshot', { error })
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      } finally {
        appendWorkflowDebugLog({
          hid: 'H1',
          loc: 'tuff-dashboard.handler',
          msg: 'request.end',
          data: {
            requestId,
            durationMs: performance.now() - requestStartedAt
          }
        })
      }
    })

    dashboardLog.success('Channel handler registered successfully')
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): void {
    this.db = null
  }

  private toIso(value: unknown): string | null {
    if (!value) return null
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

  private async buildSnapshot(limit: number, requestId: string | null) {
    const startedAt = performance.now()
    const [indexing, ocr, configOverview, logs, applications, workers] = await Promise.all([
      this.buildIndexingSection(limit, requestId),
      this.buildOcrSection(Math.min(limit, 100), requestId),
      this.buildConfigOverview(Math.min(limit, 100), requestId),
      this.buildLogOverview(Math.min(limit, 20), requestId),
      this.buildApplicationSection(requestId),
      this.buildWorkerSection(requestId)
    ])
    appendWorkflowDebugLog({
      hid: 'H1',
      loc: 'tuff-dashboard.buildSnapshot',
      msg: 'snapshot.built',
      data: {
        requestId,
        limit,
        durationMs: performance.now() - startedAt
      }
    })

    return {
      panelName: '详细信息',
      generatedAt: new Date().toISOString(),
      system: this.buildSystemOverview(),
      indexing,
      ocr,
      config: configOverview,
      logs,
      applications,
      workers
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
        total: os.totalmem()
      }
    }
  }

  private async buildApplicationSection(requestId: string | null) {
    const startedAt = performance.now()
    const activeApp = await activeAppService.getActiveApp(false)
    const rawMetrics = app.getAppMetrics()
    const metrics = rawMetrics.slice(0, 10).map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      cpu: metric.cpu?.percentCPUUsage ?? null,
      memory: metric.memory?.workingSetSize ?? null,
      created: metric.creationTime ? this.toIso(metric.creationTime) : null
    }))

    const totals = rawMetrics.reduce(
      (acc, metric) => {
        acc.cpu += metric.cpu?.percentCPUUsage ?? 0
        acc.memory += metric.memory?.workingSetSize ?? 0
        return acc
      },
      { cpu: 0, memory: 0 }
    )

    const section = {
      activeApp: activeApp
        ? {
            ...activeApp,
            lastUpdated: this.toIso(activeApp.lastUpdated)
          }
        : null,
      summary: {
        cpu: totals.cpu,
        memory: totals.memory,
        processCount: rawMetrics.length
      },
      metrics
    }

    appendWorkflowDebugLog({
      hid: 'H1',
      loc: 'tuff-dashboard.buildApplicationSection',
      msg: 'section.timing',
      data: {
        requestId,
        section: 'applications',
        durationMs: performance.now() - startedAt,
        metricsCount: rawMetrics.length
      }
    })

    return section
  }

  private async buildIndexingSection(limit: number, requestId: string | null) {
    const startedAt = performance.now()
    const db = this.ensureDb()

    const [progress, scanRows] = await Promise.all([
      fileProvider.getIndexingProgress(),
      db
        ? db.select().from(scanProgress).orderBy(desc(scanProgress.lastScanned)).limit(limit)
        : Promise.resolve([])
    ])

    const scanOverview = Array.isArray(scanRows)
      ? scanRows.map((row) => ({
          path: row.path ?? '',
          lastScanned: this.toIso(row.lastScanned)
        }))
      : []

    const entries = progress.entries.map((entry) => ({
      path: entry.path,
      status: entry.status,
      progress: entry.progress,
      processedBytes: entry.processedBytes,
      totalBytes: entry.totalBytes,
      updatedAt: this.toIso(entry.updatedAt),
      lastError: entry.lastError
    }))

    const section = {
      summary: progress.summary,
      watchedPaths: fileProvider.getWatchedPaths(),
      entries,
      scanProgress: scanOverview
    }

    appendWorkflowDebugLog({
      hid: 'H1',
      loc: 'tuff-dashboard.buildIndexingSection',
      msg: 'section.timing',
      data: {
        requestId,
        section: 'indexing',
        durationMs: performance.now() - startedAt,
        entriesCount: entries.length,
        scanProgressCount: scanOverview.length
      }
    })

    return section
  }

  private async buildOcrSection(limit: number, requestId: string | null) {
    const startedAt = performance.now()
    const snapshot = await ocrService.getDashboardSnapshot(limit)
    appendWorkflowDebugLog({
      hid: 'H1',
      loc: 'tuff-dashboard.buildOcrSection',
      msg: 'section.timing',
      data: {
        requestId,
        section: 'ocr',
        durationMs: performance.now() - startedAt,
        jobsCount: snapshot?.jobs?.length ?? null
      }
    })
    return snapshot
  }

  private async buildConfigOverview(limit: number, requestId: string | null) {
    const startedAt = performance.now()
    const db = this.ensureDb()

    if (!db) {
      const section = {
        total: 0,
        entries: [] as Array<{ key: string; value: unknown }>
      }
      appendWorkflowDebugLog({
        hid: 'H1',
        loc: 'tuff-dashboard.buildConfigOverview',
        msg: 'section.timing',
        data: {
          requestId,
          section: 'config',
          durationMs: performance.now() - startedAt,
          entriesCount: 0,
          databaseReady: false
        }
      })
      return section
    }

    const [rows, totalRow] = await Promise.all([
      db.select().from(config).orderBy(config.key).limit(limit),
      db
        .select({ total: sql<number>`COUNT(*)` })
        .from(config)
        .limit(1)
    ])

    const entries = rows.map((row) => {
      let parsed: unknown = row.value
      if (typeof row.value === 'string') {
        try {
          parsed = JSON.parse(row.value)
        } catch {
          parsed = row.value
        }
      }
      return {
        key: row.key ?? '',
        value: parsed
      }
    })

    const section = {
      total: totalRow.length > 0 ? Number(totalRow[0].total ?? 0) : entries.length,
      entries
    }

    appendWorkflowDebugLog({
      hid: 'H1',
      loc: 'tuff-dashboard.buildConfigOverview',
      msg: 'section.timing',
      data: {
        requestId,
        section: 'config',
        durationMs: performance.now() - startedAt,
        entriesCount: entries.length,
        databaseReady: true
      }
    })

    return section
  }

  private async buildLogOverview(limit: number, requestId: string | null) {
    const startedAt = performance.now()
    const logsDir = app.getPath('logs')
    const userDataDir = app.getPath('userData')
    let recentFiles: Array<{ name: string; size: number; updatedAt: string | null }> = []

    try {
      const readDirStartedAt = performance.now()
      const dirents = await readdir(logsDir, { withFileTypes: true })
      const readDirDurationMs = performance.now() - readDirStartedAt
      const files = dirents.filter((dirent) => dirent.isFile())
      const statStartedAt = performance.now()
      const detailed = await Promise.all(
        files.map(async (file) => {
          const fullPath = path.join(logsDir, file.name)
          try {
            const stats = await stat(fullPath)
            return {
              name: file.name,
              size: stats.size,
              updatedAt: this.toIso(stats.mtime)
            }
          } catch (error) {
            dashboardLog.warn('Failed to stat log file', { error, meta: { path: fullPath } })
            return null
          }
        })
      )
      const statDurationMs = performance.now() - statStartedAt
      recentFiles = detailed
        .filter(
          (entry): entry is { name: string; size: number; updatedAt: string | null } =>
            entry !== null
        )
        .sort((a, b) => {
          const left = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
          const right = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
          return right - left
        })
        .slice(0, limit)

      appendWorkflowDebugLog({
        hid: 'H5',
        loc: 'tuff-dashboard.buildLogOverview',
        msg: 'logs.scan',
        data: {
          requestId,
          limit,
          logsDir,
          direntsCount: dirents.length,
          filesCount: files.length,
          recentFilesCount: recentFiles.length,
          readDirDurationMs,
          statDurationMs
        }
      })
    } catch (error) {
      dashboardLog.warn('Failed to read logs directory', { error, meta: { dir: logsDir } })
    }

    const section = {
      directory: logsDir,
      userDataDir,
      recentFiles
    }

    appendWorkflowDebugLog({
      hid: 'H1',
      loc: 'tuff-dashboard.buildLogOverview',
      msg: 'section.timing',
      data: {
        requestId,
        section: 'logs',
        durationMs: performance.now() - startedAt,
        recentFilesCount: recentFiles.length
      }
    })

    return section
  }

  private async buildWorkerSection(requestId: string | null) {
    const startedAt = performance.now()
    try {
      const snapshot = await fileProvider.getWorkerStatusSnapshot()
      appendWorkflowDebugLog({
        hid: 'H1',
        loc: 'tuff-dashboard.buildWorkerSection',
        msg: 'section.timing',
        data: {
          requestId,
          section: 'workers',
          durationMs: performance.now() - startedAt,
          workersCount: snapshot.workers.length
        }
      })
      return snapshot
    } catch (error) {
      dashboardLog.warn('Failed to load worker status snapshot', { error })
      appendWorkflowDebugLog({
        hid: 'H1',
        loc: 'tuff-dashboard.buildWorkerSection',
        msg: 'section.error',
        data: {
          requestId,
          section: 'workers',
          durationMs: performance.now() - startedAt,
          error: error instanceof Error ? error.message : String(error)
        }
      })
      return {
        summary: { total: 0, busy: 0, idle: 0, offline: 0 },
        workers: []
      }
    }
  }

  private ensureDb(): LibSQLDatabase<typeof schema> | null {
    if (this.db) return this.db
    try {
      this.db = databaseModule.getDb()
    } catch (error) {
      dashboardLog.warn('Database not ready yet, returning partial snapshot', { error })
      return null
    }
    return this.db
  }
}

export const tuffDashboardModule = new TuffDashboardModule()
