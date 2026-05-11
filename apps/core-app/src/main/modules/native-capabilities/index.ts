import type {
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type {
  NativeCapabilityStatus,
  NativeFileIndexQueryRequest
} from '@talex-touch/utils/transport/events/types'
import type {
  HandlerContext,
  ITuffTransportMain,
  StreamContext
} from '@talex-touch/utils/transport/main'
import { NativeEvents } from '@talex-touch/utils/transport/events'
import { performance } from 'node:perf_hooks'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { everythingProvider } from '../box-tool/addon/files/everything-provider'
import { fileProvider } from '../box-tool/addon/files/file-provider'
import { nativeFileService } from './native-file-service'
import { getPermissionModule } from '../permission'
import { getNativeScreenshotService } from './screenshot-service'

const nativeLog = createLogger('NativeCapabilities')

type CodedError = Error & { code?: string }

const CAPABILITY_IDS = [
  'screenshot.display',
  'screenshot.region',
  'file-index.local',
  'file-index.everything',
  'file.stat',
  'file.open',
  'file.thumbnail',
  'media.metadata',
  'media.thumbnail',
  'ocr.image',
  'window.active',
  'window.list',
  'clipboard.read',
  'clipboard.write',
  'media.waveform',
  'media.transcode-probe'
] as const

function enforceNativePermission(
  context: Pick<HandlerContext, 'plugin'> | Pick<StreamContext<unknown>, 'plugin'>,
  apiName: string
): void {
  const pluginName = context.plugin?.name
  if (!pluginName) return

  const permissionModule = getPermissionModule()
  if (!permissionModule) {
    const error = new Error('Permission module is not ready') as CodedError
    error.code = 'ERR_NATIVE_PERMISSION_UNAVAILABLE'
    throw error
  }

  permissionModule.enforcePermission(pluginName, apiName)
}

function toPermissionState(
  context: Pick<HandlerContext, 'plugin'>,
  apiName: string
): NativeCapabilityStatus['permission'] {
  const pluginName = context.plugin?.name
  if (!pluginName) return 'not-required'
  const permissionModule = getPermissionModule()
  if (!permissionModule) return 'unknown'
  return permissionModule.checkPermission(pluginName, apiName).allowed ? 'granted' : 'denied'
}

function createUnsupportedCapability(id: string, reason = 'not-implemented-in-v1'): NativeCapabilityStatus {
  return {
    id,
    supported: false,
    available: false,
    platform: process.platform,
    degraded: true,
    reason
  }
}

function normalizeQuery(request: NativeFileIndexQueryRequest): TuffQuery {
  if (request.query) {
    return request.query
  }
  return {
    text: typeof request.text === 'string' ? request.text : ''
  }
}

function limitSearchResult(result: TuffSearchResult, limit?: number): TuffSearchResult {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return result
  }
  return {
    ...result,
    items: result.items.slice(0, Math.trunc(limit))
  }
}

export class NativeCapabilitiesModule extends BaseModule {
  static key: ModuleKey = Symbol.for('NativeCapabilitiesModule')
  name: ModuleKey = NativeCapabilitiesModule.key

  private transport: ITuffTransportMain | null = null
  private readonly disposers: Array<() => void> = []

  constructor() {
    super(NativeCapabilitiesModule.key, {
      create: true,
      dirName: 'native-capabilities'
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): void {
    const runtime = resolveMainRuntime(ctx, 'NativeCapabilitiesModule.onInit')
    this.transport = runtime.transport
    this.registerCapabilityHandlers()
    this.registerScreenshotHandlers()
    this.registerFileIndexHandlers()
    this.registerFileHandlers()
    this.registerMediaHandlers()
    nativeLog.success('Native capabilities module initialized')
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): void {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    this.transport = null
  }

  private registerScreenshotHandlers(): void {
    const transport = this.transport
    if (!transport) return

    const service = getNativeScreenshotService()
    this.disposers.push(
      transport.on(NativeEvents.screenshot.getSupport, (_payload, context) => {
        enforceNativePermission(context, 'native:screenshot:get-support')
        return service.getSupport()
      }),
      transport.on(NativeEvents.screenshot.listDisplays, (_payload, context) => {
        enforceNativePermission(context, 'native:screenshot:list-displays')
        return service.listDisplays()
      }),
      transport.on(NativeEvents.screenshot.capture, async (payload, context) => {
        enforceNativePermission(context, 'native:screenshot:capture')
        return await service.capture(payload ?? {})
      })
    )
  }

  private registerCapabilityHandlers(): void {
    const transport = this.transport
    if (!transport) return

    this.disposers.push(
      transport.on(NativeEvents.capabilities.list, (payload, context) => {
        const ids = payload?.ids?.length ? payload.ids : Array.from(CAPABILITY_IDS)
        return ids.map((id) => this.getCapabilityStatus(id, context))
      }),
      transport.on(NativeEvents.capabilities.get, (payload, context) => {
        return this.getCapabilityStatus(payload.id, context)
      })
    )
  }

  private registerFileIndexHandlers(): void {
    const transport = this.transport
    if (!transport) return

    this.disposers.push(
      transport.on(NativeEvents.fileIndex.getSupport, (_payload, context) => {
        enforceNativePermission(context, 'native:file-index:get-support')
        return this.getCapabilityStatus('file-index.local', context)
      }),
      transport.on(NativeEvents.fileIndex.getStatus, (_payload, context) => {
        enforceNativePermission(context, 'native:file-index:get-status')
        return fileProvider.getIndexingStatus()
      }),
      transport.on(NativeEvents.fileIndex.getStats, (_payload, context) => {
        enforceNativePermission(context, 'native:file-index:get-stats')
        return fileProvider.getIndexStats()
      }),
      transport.on(NativeEvents.fileIndex.query, async (payload, context) => {
        enforceNativePermission(context, 'native:file-index:query')
        const startedAt = performance.now()
        const provider = payload.provider ?? 'auto'
        const query = normalizeQuery(payload)
        const signal = new AbortController().signal
        const useEverything =
          provider === 'everything' ||
          (provider === 'auto' && process.platform === 'win32' && everythingProvider.isSearchReady())
        const result = useEverything
          ? await everythingProvider.onSearch(query, signal)
          : await fileProvider.onSearch(query, signal)

        return {
          provider: useEverything ? 'everything' : provider,
          durationMs: Math.round(performance.now() - startedAt),
          result: limitSearchResult(result, payload.limit)
        }
      }),
      transport.on(NativeEvents.fileIndex.rebuild, async (payload, context) => {
        enforceNativePermission(context, 'native:file-index:rebuild')
        return await fileProvider.rebuildIndex(payload ?? undefined)
      }),
      transport.on(NativeEvents.fileIndex.addPath, async (payload, context) => {
        enforceNativePermission(context, 'native:file-index:add-path')
        const inputPath = typeof payload?.path === 'string' ? payload.path : ''
        if (!inputPath) {
          return { success: false, status: 'invalid', reason: 'path-empty' }
        }
        return await fileProvider.addWatchPath(inputPath)
      }),
      transport.onStream(NativeEvents.fileIndex.progress, (_payload, context) => {
        enforceNativePermission(context, 'native:file-index:progress')
        fileProvider.registerProgressStream(context)
      })
    )
  }

  private registerFileHandlers(): void {
    const transport = this.transport
    if (!transport) return

    this.disposers.push(
      transport.on(NativeEvents.file.stat, (payload, context) => {
        enforceNativePermission(context, 'native:file:stat')
        return nativeFileService.stat(payload)
      }),
      transport.on(NativeEvents.file.reveal, (payload, context) => {
        enforceNativePermission(context, 'native:file:reveal')
        return nativeFileService.reveal(payload)
      }),
      transport.on(NativeEvents.file.open, (payload, context) => {
        enforceNativePermission(context, 'native:file:open')
        return nativeFileService.open(payload)
      }),
      transport.on(NativeEvents.file.getIcon, (payload, context) => {
        enforceNativePermission(context, 'native:file:get-icon')
        return nativeFileService.getIcon(payload)
      }),
      transport.on(NativeEvents.file.getThumbnail, (payload, context) => {
        enforceNativePermission(context, 'native:file:get-thumbnail')
        return nativeFileService.getThumbnail(payload)
      }),
      transport.on(NativeEvents.file.toTfile, (payload, context) => {
        enforceNativePermission(context, 'native:file:to-tfile')
        return nativeFileService.toTfile(payload)
      })
    )
  }

  private registerMediaHandlers(): void {
    const transport = this.transport
    if (!transport) return

    this.disposers.push(
      transport.on(NativeEvents.media.getSupport, (_payload, context) => {
        enforceNativePermission(context, 'native:media:get-support')
        return this.getCapabilityStatus('media.metadata', context)
      }),
      transport.on(NativeEvents.media.probe, (payload, context) => {
        enforceNativePermission(context, 'native:media:probe')
        return nativeFileService.probeMedia(payload)
      }),
      transport.on(NativeEvents.media.getThumbnail, (payload, context) => {
        enforceNativePermission(context, 'native:media:get-thumbnail')
        return nativeFileService.getMediaThumbnail(payload)
      })
    )
  }

  private getCapabilityStatus(id: string, context: HandlerContext): NativeCapabilityStatus {
    const screenshotSupport = () => getNativeScreenshotService().getSupport()
    const everythingStatus = () => everythingProvider.getStatusSnapshot()

    switch (id) {
      case 'screenshot.display':
      case 'screenshot.region': {
        const support = screenshotSupport()
        return {
          id,
          supported: support.supported,
          available: support.supported,
          platform: support.platform,
          engine: support.engine,
          permission: toPermissionState(context, 'native:screenshot:capture'),
          degraded: !support.supported,
          reason: support.reason,
          features: ['display', 'region', 'cursor-display']
        }
      }
      case 'file-index.local':
        return {
          id,
          supported: true,
          available: true,
          platform: process.platform,
          engine: 'file-provider',
          permission: toPermissionState(context, 'native:file-index:query'),
          features: ['status', 'stats', 'query', 'rebuild', 'progress']
        }
      case 'file-index.everything': {
        const status = everythingStatus()
        return {
          id,
          supported: process.platform === 'win32',
          available: status.available,
          platform: process.platform,
          engine: status.backend,
          permission: toPermissionState(context, 'native:file-index:query'),
          degraded: status.health !== 'healthy',
          reason: status.healthReason ?? status.error ?? undefined,
          features: ['query', 'status']
        }
      }
      case 'file.stat':
      case 'file.open':
      case 'file.thumbnail':
        return {
          id,
          supported: true,
          available: true,
          platform: process.platform,
          engine: 'electron',
          permission: toPermissionState(context, 'native:file:stat'),
          features: ['stat', 'open', 'reveal', 'tfile', 'thumbnail']
        }
      case 'media.metadata':
      case 'media.thumbnail':
        return {
          id,
          supported: true,
          available: true,
          platform: process.platform,
          engine: 'electron',
          permission: toPermissionState(context, 'native:media:probe'),
          degraded: id === 'media.thumbnail',
          reason: id === 'media.thumbnail' ? 'v1-image-thumbnail-only' : undefined,
          features: ['metadata', 'thumbnail']
        }
      default:
        return createUnsupportedCapability(id)
    }
  }
}

export const nativeCapabilitiesModule = new NativeCapabilitiesModule()
