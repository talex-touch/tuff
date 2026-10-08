import { DEFAULT_FILE_INDEX_CONTENT_SETTINGS } from '@talex-touch/utils/transport/events/types'
/**
 * Bumped to 2 on 2026-10-08: a dev profile that had content indexing off since version 1 still
 * carried 623 MB of `files.content` plus the same text in `search_index`, so the startup
 * reconcile has to clear once more (and compact the file afterwards).
 */
export const FILE_CONTENT_INDEX_POLICY_VERSION = 2

export interface FileIndexSettings {
  autoScanEnabled: boolean
  autoScanIntervalMs: number
  autoScanIdleThresholdMs: number
  autoScanCheckIntervalMs: number
  contentIndexingEnabled: boolean
  contentIndexCleanupVersion: number
  extraPaths: string[]
}

export const DEFAULT_FILE_INDEX_SETTINGS: Readonly<FileIndexSettings> = Object.freeze({
  autoScanEnabled: true,
  autoScanIntervalMs: 24 * 60 * 60 * 1000,
  autoScanIdleThresholdMs: 60 * 60 * 1000,
  autoScanCheckIntervalMs: 5 * 60 * 1000,
  contentIndexCleanupVersion: FILE_CONTENT_INDEX_POLICY_VERSION,
  contentIndexingEnabled: DEFAULT_FILE_INDEX_CONTENT_SETTINGS.contentIndexingEnabled,
  extraPaths: []
})

export interface ScannedFileInfo {
  path: string
  name: string
  extension: string
  size: number
  ctime: Date
  mtime: Date
}
