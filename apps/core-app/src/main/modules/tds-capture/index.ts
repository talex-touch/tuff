import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import {
  TdsCanvasSessionEvents,
  TdsCaptureEvents
} from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { app } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { TdsCanvasSessionStore, type TdsCanvasSessionStoreOptions } from './canvas-session-store'
import { TdsOffscreenCaptureRenderer, type TdsOffscreenCaptureOptions } from './offscreen-renderer'

const tdsCaptureLog = createLogger('TdsCapture')

function assertAppRendererCaller(context: HandlerContext): void {
  if (context.plugin) {
    throw new Error('TDS_CAPTURE_HOST_ONLY')
  }
}

export interface TdsCaptureModuleOptions extends TdsOffscreenCaptureOptions {
  canvasSessionStore?: TdsCanvasSessionStoreOptions
}

export class TdsCaptureModule extends BaseModule<TalexEvents> {
  static key: ModuleKey = Symbol.for('TdsCaptureModule')
  name: ModuleKey = TdsCaptureModule.key

  private transport: ITuffTransportMain | null = null
  private renderer: TdsOffscreenCaptureRenderer | null = null
  private canvasSessionStore: TdsCanvasSessionStore | null = null
  private readonly disposers: Array<() => void> = []
  private readonly moduleOptions: TdsCaptureModuleOptions

  constructor(options: TdsCaptureModuleOptions = {}) {
    super(TdsCaptureModule.key, { create: false })
    this.moduleOptions = options
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): void {
    const runtime = resolveMainRuntime(ctx, 'TdsCaptureModule.onInit')
    this.transport = runtime.transport
    this.renderer = new TdsOffscreenCaptureRenderer(this.moduleOptions)
    this.canvasSessionStore = new TdsCanvasSessionStore(this.moduleOptions.canvasSessionStore)
    this.registerTransportHandlers()

    const handleBeforeQuit = () => {
      this.renderer?.disposeAll()
    }
    app.on('before-quit', handleBeforeQuit)
    this.disposers.push(() => app.removeListener('before-quit', handleBeforeQuit))

    tdsCaptureLog.success('TDS capture module initialized')
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): void {
    for (const dispose of this.disposers.splice(0).reverse()) {
      dispose()
    }
    this.renderer?.disposeAll()
    this.renderer = null
    this.canvasSessionStore = null
    this.transport = null
  }

  getRenderer(): TdsOffscreenCaptureRenderer | null {
    return this.renderer
  }

  getCanvasSessionStore(): TdsCanvasSessionStore | null {
    return this.canvasSessionStore
  }

  private registerTransportHandlers(): void {
    const transport = this.transport
    if (!transport) return

    this.disposers.push(
      transport.on(TdsCaptureEvents.renderFrame, async (payload, context) => {
        assertAppRendererCaller(context)
        const renderer = this.renderer
        if (!renderer) {
          return {
            ok: false,
            width: 0,
            height: 0,
            durationMs: 0,
            error: 'TDS_CAPTURE_UNAVAILABLE'
          }
        }
        return await renderer.renderFrame(payload)
      }),
      transport.on(TdsCaptureEvents.releaseSession, (payload, context) => {
        assertAppRendererCaller(context)
        const renderer = this.renderer
        if (!renderer) {
          return { released: false }
        }
        return renderer.releaseSession(payload?.sessionKey ?? '')
      }),
      transport.on(TdsCanvasSessionEvents.load, async (payload, context) => {
        assertAppRendererCaller(context)
        const store = this.canvasSessionStore
        if (!store) {
          return { ok: false, session: null, error: 'TDS_CANVAS_STORE_UNAVAILABLE' }
        }
        return await store.load(payload?.conversationId ?? '')
      }),
      transport.on(TdsCanvasSessionEvents.save, async (payload, context) => {
        assertAppRendererCaller(context)
        const store = this.canvasSessionStore
        if (!store) {
          return { ok: false, error: 'TDS_CANVAS_STORE_UNAVAILABLE' }
        }
        return await store.save(payload?.conversationId ?? '', payload?.session)
      }),
      transport.on(TdsCanvasSessionEvents.delete, async (payload, context) => {
        assertAppRendererCaller(context)
        const store = this.canvasSessionStore
        if (!store) {
          return { ok: false, deleted: false, error: 'TDS_CANVAS_STORE_UNAVAILABLE' }
        }
        return await store.delete(payload?.conversationId ?? '')
      })
    )
  }
}

export const tdsCaptureModule = new TdsCaptureModule()

export {
  hashCanvasConversationId,
  MAX_CANVAS_CONVERSATION_ID_LENGTH,
  MAX_CANVAS_DELETED_IDS,
  MAX_CANVAS_FRAME_SOURCE_BYTES,
  MAX_CANVAS_FRAMES,
  MAX_CANVAS_HISTORY_BLOBS,
  MAX_CANVAS_HISTORY_ENTRIES,
  MAX_CANVAS_NOTE_TEXT_LENGTH,
  MAX_CANVAS_NOTES,
  MAX_CANVAS_SESSION_BYTES,
  MAX_CANVAS_SESSIONS,
  sanitizeCanvasSessionData,
  TDS_CANVAS_SESSIONS_DIR_NAME,
  TdsCanvasSessionStore
} from './canvas-session-store'
export type { TdsCanvasSessionStoreOptions } from './canvas-session-store'

export {
  DEFAULT_DIMENSION_HEIGHT,
  DEFAULT_DIMENSION_WIDTH,
  DEFAULT_JPEG_QUALITY,
  DEFAULT_PIXEL_RATIO,
  DEFAULT_SETTLE_MS,
  DEFAULT_TIMEOUT_MS,
  IDLE_TTL_MS,
  injectCaptureCsp,
  isAllowedTdsCaptureUrl,
  MAX_CONCURRENT_SLOTS,
  MAX_DIMENSION,
  MAX_DOM_PROBE_SCRIPT_BYTES,
  MAX_JPEG_QUALITY,
  MAX_PIXEL_RATIO,
  MAX_SETTLE_MS,
  MAX_SRCDOC_BYTES,
  MAX_TIMEOUT_MS,
  MAX_WAIT_QUEUE_LENGTH,
  MIN_DIMENSION,
  MIN_JPEG_QUALITY,
  MIN_PIXEL_RATIO,
  MIN_SETTLE_MS,
  MIN_TIMEOUT_MS,
  normalizeTdsCaptureRequest,
  secureTdsCaptureSession,
  TDS_CAPTURE_CSP,
  TDS_CAPTURE_PARTITION,
  TdsOffscreenCaptureRenderer
} from './offscreen-renderer'
export type {
  TdsCaptureNativeImageLike,
  TdsCaptureSessionLike,
  TdsCaptureTimerHandle,
  TdsCaptureTimers,
  TdsCaptureWebContentsLike,
  TdsCaptureWindowFactoryOptions,
  TdsCaptureWindowLike,
  TdsOffscreenCaptureOptions
} from './offscreen-renderer'
