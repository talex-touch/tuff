import type { TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import type {
  NativeFileIndexAddPathResult,
  NativeFileIndexProgress,
  NativeFileIndexRebuildRequest,
  NativeFileIndexRebuildResult,
  NativeFileIndexStats,
  NativeFileIndexStatus
} from '@talex-touch/utils/transport/events/types'
import type { StreamContext } from '@talex-touch/utils/transport/main'
import type { EverythingStatusResponse } from '../../../shared/events/everything'
import type { ThumbnailMediaKind } from '../../shared/thumbnail-policy'

export type NativeEverythingStatusSnapshot = Pick<
  EverythingStatusResponse,
  'available' | 'backend' | 'health' | 'healthReason' | 'error'
>

export interface NativeThumbnailGeneratedResult {
  status: 'generated'
  kind: ThumbnailMediaKind
  path: string
  mimeType: 'image/png' | 'image/jpeg'
  sizeBytes: number
  width?: number
  height?: number
  durationMs: number
}

export interface NativeThumbnailUnavailableResult {
  status: 'unsupported' | 'failed'
  kind?: ThumbnailMediaKind
  reason: string
  durationMs: number
}

export type NativeThumbnailGenerationResult =
  | NativeThumbnailGeneratedResult
  | NativeThumbnailUnavailableResult

export interface NativeVideoThumbnailSupport {
  available: boolean
  reason?: string
  ffmpegPath?: string
  ffprobePath?: string
}

export interface NativeFileIndexPort {
  getIndexingStatus(): NativeFileIndexStatus
  getIndexStats(): Promise<NativeFileIndexStats>
  onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult>
  rebuildIndex(request?: NativeFileIndexRebuildRequest): Promise<NativeFileIndexRebuildResult>
  addWatchPath(rawPath: string): Promise<NativeFileIndexAddPathResult>
  registerProgressStream(context: StreamContext<NativeFileIndexProgress>): void
}

export interface NativeEverythingPort {
  getStatusSnapshot(): NativeEverythingStatusSnapshot
  isSearchReady(): boolean
  onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult>
}

export interface NativeThumbnailPort {
  generate(
    filePath: string,
    options?: {
      extension?: string | null
      sizeBytes?: number | null
    }
  ): Promise<NativeThumbnailGenerationResult>
  getVideoThumbnailSupport(): NativeVideoThumbnailSupport
}

export interface NativeCapabilitiesPorts {
  fileIndex: NativeFileIndexPort | null
  everything: NativeEverythingPort
  thumbnail: NativeThumbnailPort
}

export interface NativeCapabilitiesPortsPatch {
  fileIndex?: NativeFileIndexPort | null
  everything?: Partial<NativeEverythingPort>
  thumbnail?: Partial<NativeThumbnailPort>
}

function createDefaultNativeCapabilitiesPorts(): NativeCapabilitiesPorts {
  return {
    fileIndex: null,
    everything: {
      getStatusSnapshot: () => ({
        available: false,
        backend: 'unavailable',
        health: 'unsupported',
        healthReason: 'everything-provider-unregistered',
        error: null
      }),
      isSearchReady: () => false,
      onSearch: async (query) => ({
        items: [],
        query,
        duration: 0,
        sources: []
      })
    },
    thumbnail: {
      generate: async () => ({
        status: 'failed',
        reason: 'thumbnail-provider-unregistered',
        durationMs: 0
      }),
      getVideoThumbnailSupport: () => ({
        available: false,
        reason: 'thumbnail-provider-unregistered'
      })
    }
  }
}

let activeNativeCapabilitiesPorts: NativeCapabilitiesPorts = createDefaultNativeCapabilitiesPorts()

export function getNativeCapabilitiesPorts(): Readonly<NativeCapabilitiesPorts> {
  return activeNativeCapabilitiesPorts
}

export function registerNativeCapabilitiesPorts(patch: NativeCapabilitiesPortsPatch): () => void {
  const previous = activeNativeCapabilitiesPorts
  const next: NativeCapabilitiesPorts = {
    fileIndex: patch.fileIndex !== undefined ? patch.fileIndex : previous.fileIndex,
    everything: { ...previous.everything, ...patch.everything },
    thumbnail: { ...previous.thumbnail, ...patch.thumbnail }
  }
  activeNativeCapabilitiesPorts = next
  return () => {
    if (activeNativeCapabilitiesPorts === next) {
      activeNativeCapabilitiesPorts = previous
    }
  }
}

export function resetNativeCapabilitiesPorts(): void {
  activeNativeCapabilitiesPorts = createDefaultNativeCapabilitiesPorts()
}
