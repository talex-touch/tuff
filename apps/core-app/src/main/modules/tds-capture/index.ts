import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import {
  TdsCanvasSessionEvents,
  TdsCaptureEvents
} from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { app, BrowserWindow } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { registerTdsCanvasSessionCascadeHandler } from './canvas-session-cascade'
import { TdsCanvasSessionStore, type TdsCanvasSessionStoreOptions } from './canvas-session-store'
import { TdsOffscreenCaptureRenderer, type TdsOffscreenCaptureOptions } from './offscreen-renderer'

const tdsCaptureLog = createLogger('TdsCapture')

type HostWindowLike = Pick<BrowserWindow, 'isDestroyed' | 'webContents'>

/**
 * Enforces host-only IPC access for TDS capture and canvas session persistence channels.
 *
 * Rejects plugin callers, missing/destroyed senders, subframes/detached frames, guest/webview
 * webContents, and non-host windows when the main host BrowserWindow (or Electron
 * `BrowserWindow.fromWebContents`) is available. Transport-wide trusted-sender registry
 * enforcement is tracked under #692.
 */
export function assertAppRendererCaller(
  context: HandlerContext,
  hostWindow?: HostWindowLike | null
): void {
  if (!context || context.plugin || !context.sender) {
    throw new Error('TDS_CAPTURE_HOST_ONLY')
  }

  const sender = context.sender as {
    isDestroyed?: () => boolean
    mainFrame?: unknown
    getType?: () => string
  }

  if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) {
    throw new Error('TDS_CAPTURE_HOST_ONLY')
  }

  if (context.senderFrame !== undefined) {
    const frame = context.senderFrame
    if (
      !frame ||
      frame.parent ||
      frame.detached ||
      (typeof frame.isDestroyed === 'function' && frame.isDestroyed()) ||
      (sender.mainFrame !== undefined && frame !== sender.mainFrame)
    ) {
      throw new Error('TDS_CAPTURE_HOST_ONLY')
    }
  }

  if (typeof sender.getType === 'function') {
    const senderType = sender.getType()
    if (senderType && senderType !== 'window') {
      throw new Error('TDS_CAPTURE_HOST_ONLY')
    }
  }

  if (hostWindow) {
    if (
      hostWindow.isDestroyed() ||
      !hostWindow.webContents ||
      hostWindow.webContents.isDestroyed() ||
      context.sender !== hostWindow.webContents
    ) {
      throw new Error('TDS_CAPTURE_HOST_ONLY')
    }
    if (
      hostWindow.webContents.mainFrame !== undefined &&
      context.senderFrame !== hostWindow.webContents.mainFrame
    ) {
      throw new Error('TDS_CAPTURE_HOST_ONLY')
    }
    return
  }

  if (typeof BrowserWindow?.fromWebContents === 'function') {
    const ownerWindow = BrowserWindow.fromWebContents(context.sender as never)
    if (!ownerWindow || ownerWindow.isDestroyed()) {
      throw new Error('TDS_CAPTURE_HOST_ONLY')
    }
  }
}

export interface TdsCaptureModuleOptions extends TdsOffscreenCaptureOptions {
  canvasSessionStore?: TdsCanvasSessionStoreOptions
  /** Override main host BrowserWindow used to verify trusted host-renderer IPC senders. */
  hostWindow?: HostWindowLike | null
}

export class TdsCaptureModule extends BaseModule<TalexEvents> {
  static key: ModuleKey = Symbol.for('TdsCaptureModule')
  name: ModuleKey = TdsCaptureModule.key

  private transport: ITuffTransportMain | null = null
  private hostWindow: HostWindowLike | null = null
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
    this.hostWindow = this.moduleOptions.hostWindow ?? runtime.window?.window ?? null
    this.renderer = new TdsOffscreenCaptureRenderer(this.moduleOptions)
    const store = new TdsCanvasSessionStore(this.moduleOptions.canvasSessionStore)
    this.canvasSessionStore = store

    this.disposers.push(
      registerTdsCanvasSessionCascadeHandler({
        markConversationDeleted: (conversationId) => store.markConversationDeleted(conversationId),
        clearConversationDeletedTombstone: (conversationId) =>
          store.clearConversationDeletedTombstone(conversationId),
        deleteForDeletedConversation: async (conversationId) => {
          const result = await store.deleteForDeletedConversation(conversationId)
          if (!result.ok) {
            tdsCaptureLog.warn('Canvas session cascade delete failed', {
              meta: { error: result.error }
            })
          }
        }
      })
    )

    void store.cleanupLegacyPlaintextFiles()
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
    this.hostWindow = null
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
        assertAppRendererCaller(context, this.hostWindow)
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
        assertAppRendererCaller(context, this.hostWindow)
        const renderer = this.renderer
        if (!renderer) {
          return { released: false }
        }
        return renderer.releaseSession(payload?.sessionKey ?? '')
      }),
      transport.on(TdsCanvasSessionEvents.load, async (payload, context) => {
        assertAppRendererCaller(context, this.hostWindow)
        const store = this.canvasSessionStore
        if (!store) {
          return { ok: false, session: null, error: 'TDS_CANVAS_STORE_UNAVAILABLE' }
        }
        return await store.load(payload?.conversationId ?? '')
      }),
      transport.on(TdsCanvasSessionEvents.save, async (payload, context) => {
        assertAppRendererCaller(context, this.hostWindow)
        const store = this.canvasSessionStore
        if (!store) {
          return { ok: false, error: 'TDS_CANVAS_STORE_UNAVAILABLE' }
        }
        return await store.save(payload?.conversationId ?? '', payload?.session)
      }),
      transport.on(TdsCanvasSessionEvents.delete, async (payload, context) => {
        assertAppRendererCaller(context, this.hostWindow)
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
  clearTdsCanvasConversationDeletedTombstone,
  deleteTdsCanvasSessionForConversation,
  markTdsCanvasConversationDeleted,
  registerTdsCanvasSessionCascadeHandler
} from './canvas-session-cascade'
export type { TdsCanvasSessionCascadeHandler } from './canvas-session-cascade'

export {
  DEFAULT_DELETE_TOMBSTONE_TTL_MS,
  estimateCanvasSessionLowerBoundBytes,
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
  TDS_CANVAS_SESSION_SECURE_PURPOSE,
  TDS_CANVAS_SESSIONS_DIR_NAME,
  TdsCanvasSessionStore
} from './canvas-session-store'
export type {
  SanitizeCanvasSessionOptions,
  TdsCanvasSessionStoreOptions
} from './canvas-session-store'

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
