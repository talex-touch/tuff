export interface FileIndexCapabilities {
  supported: boolean
  platform: string
  hasBulkScanner: boolean
  hasNativeFsevents: boolean
  hasNativeSpotlight: boolean
  hasNativeFrontmostApp: boolean
  reason?: string | null
}

export interface NativeFrontmostAppInfo {
  displayName?: string | null
  bundleId?: string | null
  processId?: number | null
  executablePath?: string | null
  windowTitle?: string | null
}

export interface NativeSpotlightHit {
  path: string
  name: string
  mtimeMs: number
  size: number
  isDir: boolean
}

export interface NativeScanFilterOptions {
  excludeNames?: string[]
  contextDependentNames?: string[]
  projectMarkers?: string[]
  excludeDirSuffixes?: string[]
  excludeHidden?: boolean
  excludePathPrefixes?: string[]
  allowPathPrefixes?: string[]
  maxDepth?: number
  includeDirs?: boolean
  skipLinkedWorktrees?: boolean
}

export interface NativeBulkScanEntry {
  dir: string
  name: string
  isDir: boolean
  mtimeSec: number
}

export interface NativeBulkScanResult {
  entries: NativeBulkScanEntry[]
  fileCount: number
  dirCount: number
  skippedCount: number
  errorCount: number
  durationMs: number
  backend: string
}

export interface NativeArenaIndexStats {
  fileCount: number
  dirCount: number
  activeCount: number
  tombstoneCount: number
  arenaBytes: number
  lastScanMs: number
  backend: string
}

export interface NativeArenaSearchOptions {
  limit?: number
  extensions?: string[]
  typeFilter?: 'file' | 'folder'
}

export interface NativeArenaSearchMatchItem {
  path: string
  name: string
  extension: string
  isDir: boolean
  mtimeSec: number
  mtimeMs: number
  score: number
  matchKind: string
  matchedRanges: number[][]
}

export interface NativeArenaSearchResult {
  items: NativeArenaSearchMatchItem[]
  totalIndexed: number
  bitmapRejected: number
  evaluatedCandidates: number
  durationMs: number
}

export interface NativeDeltaEntry {
  dir: string
  name: string
  isDir: boolean
  mtimeSec?: number
}

export interface NativeFsEventsCheckpoint {
  supported: boolean
  volumeUuid?: string | null
  currentEventId?: string | null
}

export interface NativeFsEventItem {
  eventId: string
  path: string
  kind: 'file' | 'dir' | 'symlink' | 'unknown'
  action: 'created' | 'modified' | 'removed' | 'renamed' | 'must-scan' | 'history-done'
  flags: number
  isHistoryDone: boolean
}

export interface NativeFsEventsStartOptions {
  roots: string[]
  sinceEventId?: string
  volumeUuid?: string
  latencyMs?: number
}

export interface NativeFsEventsStartResult {
  replayingSinceWhen: boolean
  checkpoint: NativeFsEventsCheckpoint
}

export interface NativeFileArenaHandle {
  indexRoots: (roots: string[], options?: NativeScanFilterOptions) => Promise<NativeArenaIndexStats>
  replaceEntries: (entries: NativeDeltaEntry[], scanMs?: number) => NativeArenaIndexStats
  applyDelta: (
    upserts: NativeDeltaEntry[],
    removedPaths: string[],
    removedPrefixes: string[],
  ) => NativeArenaIndexStats
  hasPath: (fullPath: string) => boolean
  search: (query: string, options?: NativeArenaSearchOptions) => Promise<NativeArenaSearchResult>
  saveSnapshot: (snapshotPath: string) => number
  loadSnapshot: (snapshotPath: string) => NativeArenaIndexStats
  getStats: () => NativeArenaIndexStats
}

export interface NativeFsEventsWatcherHandle {
  start: (
    options: NativeFsEventsStartOptions,
    onEvents: (events: NativeFsEventItem[]) => void,
  ) => NativeFsEventsStartResult
  stop: () => void
  isRunning: () => boolean
}

export function getFileIndexSupport(): FileIndexCapabilities
export function getLoadError(): unknown
export function getFrontmostApplicationDarwin(): NativeFrontmostAppInfo | null
export function querySpotlightNative(
  query: string,
  roots: string[],
  limit?: number,
  timeoutMs?: number,
): Promise<NativeSpotlightHit[]>
export function scanDirectoryBulk(
  roots: string[],
  options?: NativeScanFilterOptions,
): Promise<NativeBulkScanResult>
export function getFseventsVolumeCheckpoint(rootPath: string): NativeFsEventsCheckpoint
export function createNativeFileArena(): NativeFileArenaHandle | null
export function createNativeFsEventsWatcher(): NativeFsEventsWatcherHandle | null
