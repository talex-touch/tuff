import type { PerformanceProcessRole } from '@talex-touch/utils/transport/events/types'
import type { BrowserWindow } from 'electron'
import type { FileProviderWorkerStatusSnapshot } from '../box-tool/addon/files/services/file-provider-worker-status-service'

export interface SystemPerformanceDiagnosticsPort {
  resolveUtilityProcessRole(metric: {
    name?: string
    serviceName?: string
  }): PerformanceProcessRole | null
  getCoreBoxWindow(): BrowserWindow | null
  resolvePluginNameByWebContents(webContentsId: number): string | null
}

export interface SystemDashboardIndexingProgressEntry {
  path: string
  status: string | null
  progress: number | null
  processedBytes: number | null
  totalBytes: number | null
  updatedAt: Date | null
  lastError: string | null
}

export interface SystemDashboardIndexingProgress {
  summary: Record<string, number>
  entries: SystemDashboardIndexingProgressEntry[]
}

export interface SystemDashboardOcrSnapshot {
  jobs?: unknown[]
  [key: string]: unknown
}

export interface SystemDashboardDiagnosticsPort {
  getIndexingProgress(): Promise<SystemDashboardIndexingProgress>
  getWatchedPaths(): string[]
  getWorkerStatusSnapshot(): Promise<FileProviderWorkerStatusSnapshot>
  getOcrDashboardSnapshot(limit: number): Promise<SystemDashboardOcrSnapshot>
}

export interface SystemPorts {
  performance: SystemPerformanceDiagnosticsPort
  dashboard: SystemDashboardDiagnosticsPort
}

export interface SystemPortsPatch {
  performance?: Partial<SystemPerformanceDiagnosticsPort>
  dashboard?: Partial<SystemDashboardDiagnosticsPort>
}

function createDefaultSystemPorts(): SystemPorts {
  return {
    performance: {
      resolveUtilityProcessRole: () => null,
      getCoreBoxWindow: () => null,
      resolvePluginNameByWebContents: () => null
    },
    dashboard: {
      getIndexingProgress: async () => ({ summary: {}, entries: [] }),
      getWatchedPaths: () => [],
      getWorkerStatusSnapshot: async () => ({
        summary: { total: 0, busy: 0, idle: 0, offline: 0 },
        workers: []
      }),
      getOcrDashboardSnapshot: async () => ({ jobs: [] })
    }
  }
}

let activeSystemPorts: SystemPorts = createDefaultSystemPorts()

export function getSystemPorts(): Readonly<SystemPorts> {
  return activeSystemPorts
}

export function registerSystemPorts(patch: SystemPortsPatch): () => void {
  const previous = activeSystemPorts
  const next: SystemPorts = {
    performance: { ...previous.performance, ...patch.performance },
    dashboard: { ...previous.dashboard, ...patch.dashboard }
  }
  activeSystemPorts = next
  return () => {
    if (activeSystemPorts === next) {
      activeSystemPorts = previous
    }
  }
}

export function resetSystemPorts(): void {
  activeSystemPorts = createDefaultSystemPorts()
}
