import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { NativeScreenshotDisplay } from '@talex-touch/utils/transport/events/types'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import {
  ScreenshotSessionEvents,
  normalizeScreenshotSessionStartRequest
} from '@talex-touch/utils/transport/events/screenshot-session'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { BrowserWindow, dialog, screen, webContents } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { TouchWindow } from '../../core/touch-window'
import { createLogger } from '../../utils/logger'
import { getCoreBoxRendererPath, getCoreBoxRendererUrl, isDevMode } from '../../utils/renderer-url'
import { BaseModule } from '../abstract-base-module'
import { shortcutModule } from '../global-shortcon'
import { getNativeScreenshotService } from '../native-capabilities/screenshot-service'
import { getPermissionModule } from '../permission'
import {
  ScreenshotSessionManager,
  type ScreenshotSessionEntrypoint,
  type ScreenshotSessionStartOptions
} from './session-manager'
import { ElectronScreenshotWindowFactory, type ScreenshotTouchWindowLike } from './window-factory'

const screenshotSessionLog = createLogger('ScreenshotSession')
const SCREENSHOT_SHORTCUT_ID = 'screenshot.tool.start'
const SCREENSHOT_SHORTCUT_OWNER = 'module.screenshot-session'
const SCREENSHOT_DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+A'
const SCREENSHOT_LEGACY_DEFAULT_ACCELERATORS = ['CommandOrControl+Shift+S']

type CodedError = Error & { code?: string }

let activeManager: ScreenshotSessionManager | null = null

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as CodedError).code)
    : 'SCREENSHOT_SESSION_FAILED'
}

function ownerKey(context: HandlerContext): string {
  return context.plugin
    ? `plugin:${context.plugin.name}:sender:${context.sender.id}`
    : `renderer:${context.sender.id}`
}

function enforceVisiblePluginPermission(context: HandlerContext): void {
  if (!context.plugin) return
  if (!isAuthoritativePluginContext(context.plugin)) {
    const error = new Error('Verified plugin context is required') as CodedError
    error.code = 'ERR_NATIVE_PLUGIN_UNVERIFIED'
    throw error
  }
  const permissionModule = getPermissionModule()
  if (!permissionModule) {
    const error = new Error('Permission module is not ready') as CodedError
    error.code = 'ERR_NATIVE_PERMISSION_UNAVAILABLE'
    throw error
  }
  permissionModule.enforcePermission(
    context.plugin.name,
    'native:screenshot:capture',
    context.plugin.sdkapi
  )
}

function getDisplaySafeAreaInsets(display: NativeScreenshotDisplay): {
  top: number
  right: number
  bottom: number
  left: number
} {
  const workArea = screen.getDisplayMatching({
    x: display.x,
    y: display.y,
    width: display.width,
    height: display.height
  }).workArea
  return {
    top: Math.max(0, workArea.y - display.y),
    right: Math.max(0, display.x + display.width - (workArea.x + workArea.width)),
    bottom: Math.max(0, display.y + display.height - (workArea.y + workArea.height)),
    left: Math.max(0, workArea.x - display.x)
  }
}

function createWindowFactory(): ElectronScreenshotWindowFactory {
  return new ElectronScreenshotWindowFactory({
    createWindow: (options) => new TouchWindow(options),
    loadRenderer: async (window: ScreenshotTouchWindowLike) => {
      const touchWindow = window as TouchWindow
      if (isDevMode()) {
        await touchWindow.loadURL(getCoreBoxRendererUrl())
      } else {
        await touchWindow.loadFile(getCoreBoxRendererPath())
      }
    }
  })
}

export function getScreenshotSessionManager(): ScreenshotSessionManager {
  if (!activeManager) {
    const error = new Error('Screenshot session manager is unavailable') as CodedError
    error.code = 'SCREENSHOT_SESSION_UNAVAILABLE'
    throw error
  }
  return activeManager
}

export class ScreenshotSessionModule extends BaseModule {
  static key: ModuleKey = Symbol.for('ScreenshotSessionModule')
  name: ModuleKey = ScreenshotSessionModule.key

  private transport: ITuffTransportMain | null = null
  private manager: ScreenshotSessionManager | null = null
  private readonly disposers: Array<() => void> = []

  constructor() {
    super(ScreenshotSessionModule.key, { create: false })
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const runtime = resolveMainRuntime(ctx, 'ScreenshotSessionModule.onInit')
    this.transport = runtime.transport
    const service = getNativeScreenshotService()
    this.manager = new ScreenshotSessionManager({
      service,
      windowFactory: createWindowFactory(),
      saveResource: async (resource, parentWebContentsId) => {
        const options: Electron.SaveDialogOptions = {
          title: 'Save Screenshot',
          defaultPath: `Screenshot-${new Date().toISOString().replaceAll(':', '-')}.png`,
          filters: [{ name: 'PNG Image', extensions: ['png'] }]
        }
        const parentContents = parentWebContentsId ? webContents.fromId(parentWebContentsId) : null
        const parentWindow = parentContents ? BrowserWindow.fromWebContents(parentContents) : null
        const response = parentWindow
          ? await dialog.showSaveDialog(parentWindow, options)
          : await dialog.showSaveDialog(options)
        if (response.canceled || !response.filePath) return false
        await service.copyCaptureResource(resource.tfileUrl, response.filePath)
        return true
      },
      getSafeAreaInsets: getDisplaySafeAreaInsets
    })
    activeManager = this.manager
    this.registerTransportHandlers()
    shortcutModule.registerMainShortcut(
      SCREENSHOT_SHORTCUT_ID,
      SCREENSHOT_DEFAULT_ACCELERATOR,
      () => {
        void this.startStandalone('shortcut').catch((error) => {
          screenshotSessionLog.warn('Screenshot shortcut start failed', {
            meta: { code: errorCode(error) }
          })
        })
      },
      {
        enabled: true,
        owner: SCREENSHOT_SHORTCUT_OWNER,
        legacyDefaultAccelerators: SCREENSHOT_LEGACY_DEFAULT_ACCELERATORS
      }
    )
    screenshotSessionLog.success('Screenshot session module initialized')
  }

  async onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): Promise<void> {
    shortcutModule.unregisterMainShortcut(SCREENSHOT_SHORTCUT_ID)
    for (const dispose of this.disposers.splice(0)) dispose()
    await this.manager?.dispose()
    if (activeManager === this.manager) activeManager = null
    this.manager = null
    this.transport = null
  }

  async startStandalone(
    entrypoint: ScreenshotSessionEntrypoint,
    delayMs: 0 | 3000 | 5000 = 0
  ): Promise<void> {
    const manager = this.requireManager()
    await manager.start({
      entrypoint,
      ownerKey: `internal:${entrypoint}`,
      completionMode: 'editor',
      delayMs,
      initialTarget: 'free-region'
    })
  }

  private registerTransportHandlers(): void {
    const transport = this.transport
    if (!transport) return

    this.disposers.push(
      transport.on(ScreenshotSessionEvents.lifecycle.start, async (payload, context) => {
        enforceVisiblePluginPermission(context)
        const normalized = normalizeScreenshotSessionStartRequest(payload)
        if (!normalized) {
          return { accepted: false, reason: 'invalid-request' }
        }
        const options: ScreenshotSessionStartOptions = {
          ...normalized,
          entrypoint: context.plugin ? 'plugin' : 'demo',
          ownerKey: ownerKey(context)
        }
        return await this.requireManager().start(options)
      }),
      transport.on(ScreenshotSessionEvents.lifecycle.waitResult, async (payload, context) => {
        enforceVisiblePluginPermission(context)
        return await this.requireManager().waitForResult(payload.sessionId, ownerKey(context))
      }),
      transport.on(ScreenshotSessionEvents.overlay.ready, (_payload, context) => {
        const state = this.requireManager().getOverlayStateForSender(context.sender.id)
        if (!state) {
          const error = new Error('Screenshot overlay sender is unavailable') as CodedError
          error.code = 'SCREENSHOT_SESSION_SENDER_UNAUTHORIZED'
          throw error
        }
        return state
      }),
      transport.on(ScreenshotSessionEvents.overlay.command, async (payload, context) => {
        const response = await this.requireManager().command(
          payload.sessionId,
          context.sender.id,
          payload.command
        )
        if (
          response.accepted &&
          payload.command.type !== 'confirm' &&
          payload.command.type !== 'cancel'
        ) {
          await this.broadcastOverlayState(payload.sessionId)
        }
        return response
      }),
      transport.on(ScreenshotSessionEvents.editor.ready, (_payload, context) => {
        const state = this.requireManager().getEditorStateForSender(context.sender.id)
        if (!state) {
          const error = new Error('Screenshot editor sender is unavailable') as CodedError
          error.code = 'SCREENSHOT_SESSION_SENDER_UNAUTHORIZED'
          throw error
        }
        return state
      }),
      transport.on(ScreenshotSessionEvents.editor.action, async (payload, context) => {
        return await this.requireManager().editorAction(
          payload.sessionId,
          context.sender.id,
          payload.action
        )
      })
    )
  }

  private async broadcastOverlayState(sessionId: string): Promise<void> {
    const transport = this.transport
    if (!transport) return
    await Promise.allSettled(
      this.requireManager()
        .getOverlayStates(sessionId)
        .map(async ({ webContentsId, state }) => {
          const target = webContents.fromId(webContentsId)
          if (!target || target.isDestroyed()) return
          await transport.sendTo(target, ScreenshotSessionEvents.overlay.state, state)
        })
    )
  }

  private requireManager(): ScreenshotSessionManager {
    if (!this.manager) {
      const error = new Error('Screenshot session manager is unavailable') as CodedError
      error.code = 'SCREENSHOT_SESSION_UNAVAILABLE'
      throw error
    }
    return this.manager
  }
}

export const screenshotSessionModule = new ScreenshotSessionModule()
