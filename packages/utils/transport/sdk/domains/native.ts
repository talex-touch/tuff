import type {
  NativeCapabilitiesListRequest,
  NativeCapabilityGetRequest,
  NativeCapabilityStatus,
  NativeFileActionResult,
  NativeFileIndexAddPathRequest,
  NativeFileIndexAddPathResult,
  NativeFileIndexProgress,
  NativeFileIndexQueryRequest,
  NativeFileIndexQueryResult,
  NativeFileIndexRebuildRequest,
  NativeFileIndexRebuildResult,
  NativeFileIndexStats,
  NativeFileIndexStatus,
  NativeFileIndexSupport,
  NativeFilePathRequest,
  NativeFileResourceRequest,
  NativeFileStatResult,
  NativeFileTfileResult,
  NativeMediaProbeRequest,
  NativeMediaProbeResult,
  NativeMediaThumbnailRequest,
  NativeResourceRef,
  NativeScreenshotCaptureRequest,
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay,
  NativeScreenshotSupport
} from '../../events/types'
import type { ITuffTransport, StreamController, StreamOptions } from '../../types'
import { NativeEvents } from '../../events'

export interface NativeCapabilitiesSdk {
  list: (request?: NativeCapabilitiesListRequest) => Promise<NativeCapabilityStatus[]>
  get: (request: NativeCapabilityGetRequest) => Promise<NativeCapabilityStatus>
}

export interface NativeScreenshotSdk {
  getSupport: () => Promise<NativeScreenshotSupport>
  listDisplays: () => Promise<NativeScreenshotDisplay[]>
  capture: (
    request?: NativeScreenshotCaptureRequest
  ) => Promise<NativeScreenshotCaptureResult>
}

export interface NativeFileIndexSdk {
  getSupport: () => Promise<NativeFileIndexSupport>
  getStatus: () => Promise<NativeFileIndexStatus>
  getStats: () => Promise<NativeFileIndexStats>
  query: (request: NativeFileIndexQueryRequest) => Promise<NativeFileIndexQueryResult>
  rebuild: (request?: NativeFileIndexRebuildRequest) => Promise<NativeFileIndexRebuildResult>
  addPath: (request: NativeFileIndexAddPathRequest) => Promise<NativeFileIndexAddPathResult>
  streamProgress: (options: StreamOptions<NativeFileIndexProgress>) => Promise<StreamController>
}

export interface NativeFileSdk {
  stat: (request: NativeFilePathRequest) => Promise<NativeFileStatResult>
  reveal: (request: NativeFilePathRequest) => Promise<NativeFileActionResult>
  open: (request: NativeFilePathRequest) => Promise<NativeFileActionResult>
  getIcon: (request: NativeFileResourceRequest) => Promise<NativeResourceRef>
  getThumbnail: (request: NativeFileResourceRequest) => Promise<NativeResourceRef>
  toTfile: (request: NativeFilePathRequest) => Promise<NativeFileTfileResult>
}

export interface NativeMediaSdk {
  getSupport: () => Promise<NativeCapabilityStatus>
  probe: (request: NativeMediaProbeRequest) => Promise<NativeMediaProbeResult>
  getThumbnail: (request: NativeMediaThumbnailRequest) => Promise<NativeResourceRef>
}

export interface NativeSdk {
  capabilities: NativeCapabilitiesSdk
  screenshot: NativeScreenshotSdk
  fileIndex: NativeFileIndexSdk
  file: NativeFileSdk
  media: NativeMediaSdk
}

export function createNativeSdk(transport: ITuffTransport): NativeSdk {
  return {
    capabilities: {
      list: (request?: NativeCapabilitiesListRequest) =>
        transport.send(NativeEvents.capabilities.list, request),
      get: (request: NativeCapabilityGetRequest) =>
        transport.send(NativeEvents.capabilities.get, request)
    },
    screenshot: {
      getSupport: () => transport.send(NativeEvents.screenshot.getSupport),
      listDisplays: () => transport.send(NativeEvents.screenshot.listDisplays),
      capture: (request?: NativeScreenshotCaptureRequest) =>
        transport.send(NativeEvents.screenshot.capture, request)
    },
    fileIndex: {
      getSupport: () => transport.send(NativeEvents.fileIndex.getSupport),
      getStatus: () => transport.send(NativeEvents.fileIndex.getStatus),
      getStats: () => transport.send(NativeEvents.fileIndex.getStats),
      query: (request: NativeFileIndexQueryRequest) =>
        transport.send(NativeEvents.fileIndex.query, request),
      rebuild: (request?: NativeFileIndexRebuildRequest) =>
        transport.send(NativeEvents.fileIndex.rebuild, request),
      addPath: (request: NativeFileIndexAddPathRequest) =>
        transport.send(NativeEvents.fileIndex.addPath, request),
      streamProgress: (options: StreamOptions<NativeFileIndexProgress>) =>
        transport.stream(NativeEvents.fileIndex.progress, undefined, options)
    },
    file: {
      stat: (request: NativeFilePathRequest) => transport.send(NativeEvents.file.stat, request),
      reveal: (request: NativeFilePathRequest) => transport.send(NativeEvents.file.reveal, request),
      open: (request: NativeFilePathRequest) => transport.send(NativeEvents.file.open, request),
      getIcon: (request: NativeFileResourceRequest) =>
        transport.send(NativeEvents.file.getIcon, request),
      getThumbnail: (request: NativeFileResourceRequest) =>
        transport.send(NativeEvents.file.getThumbnail, request),
      toTfile: (request: NativeFilePathRequest) => transport.send(NativeEvents.file.toTfile, request)
    },
    media: {
      getSupport: () => transport.send(NativeEvents.media.getSupport),
      probe: (request: NativeMediaProbeRequest) => transport.send(NativeEvents.media.probe, request),
      getThumbnail: (request: NativeMediaThumbnailRequest) =>
        transport.send(NativeEvents.media.getThumbnail, request)
    }
  }
}
