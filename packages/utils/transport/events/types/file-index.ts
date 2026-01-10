/**
 * @fileoverview Type definitions for File Index events
 * @module @talex-touch/utils/transport/events/types/file-index
 */

export type FileIndexStage =
  | 'idle'
  | 'cleanup'
  | 'scanning'
  | 'indexing'
  | 'reconciliation'
  | 'completed'
  | string

export interface FileIndexProgress {
  stage: FileIndexStage
  current: number
  total: number
  progress: number
  startTime: number | null
  estimatedRemainingMs: number | null
  averageItemsPerSecond: number
}

export interface FileIndexStatus {
  isInitializing: boolean
  initializationFailed: boolean
  error: string | null
  progress: {
    stage: FileIndexStage | null
    current: number
    total: number
  }
  startTime: number | null
  estimatedCompletion: number | null
  estimatedRemainingMs: number | null
  averageItemsPerSecond: number
}

export interface FileIndexStats {
  totalFiles: number
  failedFiles: number
  skippedFiles: number
}

export interface FileIndexRebuildResult {
  success: boolean
  message?: string
  error?: string
}

export interface FileIndexBatteryStatus {
  level: number
  charging: boolean
}
