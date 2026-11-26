import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { TdsCaptureEvents } from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { app } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { TdsOffscreenCaptureRenderer, type TdsOffscreenCaptureOptions } from './offscreen-renderer'

const tdsCaptureLog = createLogger('TdsCapture')

function assertAppRendererCaller(context: HandlerContext): void {
  if (context.plugin) {
    throw new Error('TDS_CAPTURE_HOST_ONLY')
  }
}

export class TdsCaptureModule extends BaseModule<TalexEvents> {
  static key: ModuleKey = Symbol.for('TdsCaptureModule')
  name: ModuleKey = TdsCaptureModule.key

  private transport: ITuffTransportMain | null = null
  private renderer: TdsOffscreenCaptureRenderer | null = null
  private readonly disposers: Array<() => void> = []
  private readonly rendererOptions: TdsOffscreenCaptureOptions

  constructor(options: TdsOffscreenCaptureOptions = {}) {
    super(TdsCaptureModule.key, { create: false })
    this.rendererOptions = options
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): void {
    const runtime = resolveMainRuntime(ctx, 'TdsCaptureModule.onInit')
    this.transport = runtime.transport
    this.renderer = new TdsOffscreenCaptureRenderer(this.rendererOptions)
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
    this.transport = null
  }

  getRenderer(): TdsOffscreenCaptureRenderer | null {
    return this.renderer
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
      })
    )
  }
}

export const tdsCaptureModule = new TdsCaptureModule()

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
