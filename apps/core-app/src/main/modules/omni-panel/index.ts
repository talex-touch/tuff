import type {
  MaybePromise,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { ShortcutTriggerKind } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { OmniPanelShowRequest } from '../../../shared/events/omni-panel'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { promisify } from 'node:util'
import { StorageList } from '@talex-touch/utils'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { app, clipboard } from 'electron'
import { OmniPanelWindowOption } from '../../config/default'
import { genTouchApp } from '../../core'
import { TouchWindow } from '../../core/touch-window'
import { getCoreBoxRendererPath } from '../../utils/renderer-url'
import { BaseModule } from '../abstract-base-module'
import { shortcutModule } from '../global-shortcon'
import { getMainConfig } from '../storage'
import {
  omniPanelContextEvent,
  omniPanelHideEvent,
  omniPanelShowEvent,
  omniPanelToggleEvent
} from '../../../shared/events/omni-panel'
import { createLogger } from '../../utils/logger'

const omniPanelLog = createLogger('OmniPanel')
const execFileAsync = promisify(execFile)
const requireFromCurrentModule = createRequire(import.meta.url)
const LONG_PRESS_MS = 600
const LONG_PRESS_MOVE_THRESHOLD = 6
const OMNI_PANEL_SHORTCUT_ID = 'core.omniPanel.toggle'
const OMNI_PANEL_MOUSE_TRIGGER_ID = 'core.omniPanel.mouseLongPress'
const OMNI_PANEL_EXPERIMENT_ENV_KEY = 'TUFF_ENABLE_OMNIPANEL_EXPERIMENT'

interface MouseHookEvent {
  button?: number
  x?: number
  y?: number
}

interface MouseHookApi {
  on: (event: string, callback: (event: MouseHookEvent) => void) => void
  off?: (event: string, callback: (event: MouseHookEvent) => void) => void
  start: () => void
  stop: () => void
  removeAllListeners?: (event?: string) => void
}

interface OmniPanelSettings {
  enableShortcut: boolean
  enableMouseLongPress: boolean
}

interface ClipboardSnapshot {
  items: Array<{
    format: string
    data: Buffer
  }>
}

class OmniPanelModule extends BaseModule {
  static key: symbol = Symbol.for('OmniPanel')
  name: ModuleKey = OmniPanelModule.key

  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private panelWindow: TouchWindow | null = null
  private isVisible = false
  private mouseHook: MouseHookApi | null = null
  private mouseDownPosition: { x: number; y: number } | null = null
  private longPressTimer: NodeJS.Timeout | null = null
  private mouseHandlers: Array<{
    event: string
    callback: (event: MouseHookEvent) => void
  }> = []

  constructor() {
    super(OmniPanelModule.key, { create: false }, OMNI_PANEL_EXPERIMENT_ENV_KEY)
  }

  async onInit(_ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const channel = genTouchApp().channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)
    this.registerTransportHandlers()
    const settings = this.getSettingsSnapshot()
    this.registerShortcut(settings.enableShortcut)
    this.registerMouseLongPressTrigger(settings.enableMouseLongPress)
    omniPanelLog.info('Module initialized')
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): MaybePromise<void> {
    this.clearLongPressTimer()
    this.cleanupMouseLongPressHook()

    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transport = null

    if (this.panelWindow && !this.panelWindow.window.isDestroyed()) {
      this.panelWindow.window.close()
    }
    this.panelWindow = null
    this.isVisible = false
  }

  private getSettingsSnapshot(setting?: AppSetting): OmniPanelSettings {
    const appSetting = setting ?? ((getMainConfig(StorageList.APP_SETTING) as AppSetting) || {})
    const omniPanel = (appSetting as AppSetting & { omniPanel?: Record<string, unknown> }).omniPanel
    return {
      enableShortcut:
        typeof omniPanel?.enableShortcut === 'boolean' ? omniPanel.enableShortcut : true,
      enableMouseLongPress:
        typeof omniPanel?.enableMouseLongPress === 'boolean' ? omniPanel.enableMouseLongPress : true
    }
  }

  private registerShortcut(enabled: boolean): void {
    shortcutModule.registerMainShortcut(
      OMNI_PANEL_SHORTCUT_ID,
      'CommandOrControl+Shift+P',
      () => {
        void this.toggle({ captureSelection: true, source: 'shortcut' })
      },
      { enabled }
    )
  }

  private registerMouseLongPressTrigger(enabled: boolean): void {
    shortcutModule.registerMainTrigger(
      OMNI_PANEL_MOUSE_TRIGGER_ID,
      ShortcutTriggerKind.MOUSE_RIGHT_LONG_PRESS,
      {
        enabled,
        onStateChange: (active) => {
          this.applyMouseLongPressSetting(active)
        }
      }
    )
  }

  private applyMouseLongPressSetting(enabled: boolean): void {
    if (enabled) {
      this.setupMouseLongPressHook()
      return
    }
    this.clearLongPressTimer()
    this.cleanupMouseLongPressHook()
  }

  private registerTransportHandlers(): void {
    if (!this.transport) return

    this.transportDisposers.push(
      this.transport.on(omniPanelToggleEvent, async (payload) => {
        await this.toggle(payload)
      })
    )

    this.transportDisposers.push(
      this.transport.on(omniPanelShowEvent, async (payload) => {
        await this.show(payload)
      })
    )

    this.transportDisposers.push(
      this.transport.on(omniPanelHideEvent, async () => {
        this.hide()
      })
    )
  }

  private async ensureWindow(): Promise<TouchWindow> {
    if (this.panelWindow && !this.panelWindow.window.isDestroyed()) {
      return this.panelWindow
    }

    const window = new TouchWindow({ ...OmniPanelWindowOption })
    window.window.on('closed', () => {
      this.panelWindow = null
      this.isVisible = false
    })
    window.window.on('hide', () => {
      this.isVisible = false
    })
    window.window.on('show', () => {
      this.isVisible = true
    })

    if (app.isPackaged) {
      await window.loadFile(getCoreBoxRendererPath())
    } else {
      const rendererUrl = process.env.ELECTRON_RENDERER_URL
      if (!rendererUrl) {
        throw new Error('ELECTRON_RENDERER_URL is not set')
      }
      await window.loadURL(rendererUrl)
    }

    window.window.hide()
    this.panelWindow = window
    return window
  }

  private async toggle(options?: OmniPanelShowRequest): Promise<void> {
    if (this.isVisible) {
      this.hide()
      return
    }
    await this.show(options)
  }

  private async show(options?: OmniPanelShowRequest): Promise<void> {
    const targetWindow = await this.ensureWindow()
    const source = options?.source || 'manual'
    let text = ''

    if (options?.captureSelection !== false) {
      text = await this.captureSelectionText()
    }

    targetWindow.window.show()
    targetWindow.window.focus()
    this.isVisible = true
    await this.pushContext(text, source)
  }

  private hide(): void {
    if (!this.panelWindow || this.panelWindow.window.isDestroyed()) return
    this.panelWindow.window.hide()
    this.isVisible = false
  }

  private async pushContext(text: string, source: string): Promise<void> {
    if (!this.transport) return
    if (!this.panelWindow || this.panelWindow.window.isDestroyed()) return

    const payload = {
      text,
      hasSelection: text.trim().length > 0,
      source,
      capturedAt: Date.now()
    }

    await this.transport.sendTo(this.panelWindow.window.webContents, omniPanelContextEvent, payload)
  }

  private async captureSelectionText(): Promise<string> {
    if (process.platform === 'darwin') {
      const directSelection = await this.captureMacSelectionTextDirectly()
      if (directSelection) {
        return directSelection.trim()
      }
    }

    const clipboardSnapshot = this.snapshotClipboard()
    try {
      await this.simulateCopyCommand()
      await this.delay(120)
      return clipboard.readText().trim()
    } catch (error) {
      omniPanelLog.warn('Failed to capture selected text', { error })
      return ''
    } finally {
      this.restoreClipboard(clipboardSnapshot)
    }
  }

  private async captureMacSelectionTextDirectly(): Promise<string | null> {
    try {
      const script = [
        'tell application "System Events"',
        '  tell (first process whose frontmost is true)',
        '    try',
        '      set focusedElement to value of attribute "AXFocusedUIElement"',
        '      set selectedText to value of attribute "AXSelectedText" of focusedElement',
        '      if selectedText is missing value then',
        '        return ""',
        '      end if',
        '      return selectedText',
        '    on error',
        '      return ""',
        '    end try',
        '  end tell',
        'end tell'
      ].join('\n')
      const { stdout } = await execFileAsync('osascript', ['-e', script])
      const selectedText = typeof stdout === 'string' ? stdout.trim() : ''
      return selectedText || null
    } catch {
      return null
    }
  }

  private snapshotClipboard(): ClipboardSnapshot {
    const formats = clipboard.availableFormats()
    const items: ClipboardSnapshot['items'] = []
    for (const format of formats) {
      try {
        items.push({
          format,
          data: clipboard.readBuffer(format)
        })
      } catch (error) {
        omniPanelLog.debug(`Skip clipboard format snapshot: ${format}`, { error })
      }
    }
    return { items }
  }

  private restoreClipboard(snapshot: ClipboardSnapshot): void {
    try {
      clipboard.clear()
      for (const item of snapshot.items) {
        clipboard.writeBuffer(item.format, item.data)
      }
    } catch (error) {
      omniPanelLog.warn('Failed to restore clipboard snapshot', { error })
    }
  }

  private async simulateCopyCommand(): Promise<void> {
    if (process.platform === 'darwin') {
      await execFileAsync('osascript', [
        '-e',
        'tell application "System Events" to keystroke "c" using {command down}'
      ])
      return
    }

    if (process.platform === 'win32') {
      const script =
        "$wshell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 30; $wshell.SendKeys('^c')"
      await execFileAsync('powershell', ['-NoLogo', '-NonInteractive', '-Command', script])
      return
    }

    if (process.platform === 'linux') {
      await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+c'])
      return
    }

    throw new Error(`Unsupported platform: ${process.platform}`)
  }

  private setupMouseLongPressHook(): void {
    if (this.mouseHook) {
      return
    }
    try {
      const hookModule = requireFromCurrentModule('uiohook-napi') as {
        uIOhook?: MouseHookApi
      }
      const hook = hookModule?.uIOhook
      if (!hook) {
        omniPanelLog.warn('uiohook-napi loaded without uIOhook export')
        return
      }

      const onMouseDown = (event: MouseHookEvent) => {
        if (!this.isRightMouseButton(event)) return
        const x = typeof event.x === 'number' ? event.x : 0
        const y = typeof event.y === 'number' ? event.y : 0
        this.mouseDownPosition = { x, y }
        this.clearLongPressTimer()
        this.longPressTimer = setTimeout(() => {
          void this.show({ captureSelection: true, source: 'mouse-long-press' })
          this.clearLongPressTimer()
          this.mouseDownPosition = null
        }, LONG_PRESS_MS)
      }

      const onMouseUp = (event: MouseHookEvent) => {
        if (!this.isRightMouseButton(event)) return
        this.clearLongPressTimer()
        this.mouseDownPosition = null
      }

      const onMouseMove = (event: MouseHookEvent) => {
        if (!this.mouseDownPosition || !this.longPressTimer) return
        const x = typeof event.x === 'number' ? event.x : this.mouseDownPosition.x
        const y = typeof event.y === 'number' ? event.y : this.mouseDownPosition.y
        const deltaX = Math.abs(x - this.mouseDownPosition.x)
        const deltaY = Math.abs(y - this.mouseDownPosition.y)
        if (deltaX > LONG_PRESS_MOVE_THRESHOLD || deltaY > LONG_PRESS_MOVE_THRESHOLD) {
          this.clearLongPressTimer()
          this.mouseDownPosition = null
        }
      }

      hook.on('mousedown', onMouseDown)
      hook.on('mouseup', onMouseUp)
      hook.on('mousemove', onMouseMove)
      hook.start()

      this.mouseHook = hook
      this.mouseHandlers = [
        { event: 'mousedown', callback: onMouseDown },
        { event: 'mouseup', callback: onMouseUp },
        { event: 'mousemove', callback: onMouseMove }
      ]
      omniPanelLog.info('Global mouse long-press hook enabled')
    } catch (error) {
      omniPanelLog.warn('uiohook-napi unavailable, mouse long-press disabled', { error })
    }
  }

  private cleanupMouseLongPressHook(): void {
    if (!this.mouseHook) return

    try {
      for (const handler of this.mouseHandlers) {
        if (typeof this.mouseHook.off === 'function') {
          this.mouseHook.off(handler.event, handler.callback)
        } else if (typeof this.mouseHook.removeAllListeners === 'function') {
          this.mouseHook.removeAllListeners(handler.event)
        }
      }
      this.mouseHook.stop()
    } catch (error) {
      omniPanelLog.warn('Failed to cleanup mouse hook', { error })
    } finally {
      this.mouseHook = null
      this.mouseHandlers = []
    }
  }

  private isRightMouseButton(event: MouseHookEvent): boolean {
    const button = Number(event.button)
    return button === 2 || button === 3
  }

  private clearLongPressTimer(): void {
    if (!this.longPressTimer) return
    clearTimeout(this.longPressTimer)
    this.longPressTimer = null
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}

export const omniPanelModule = new OmniPanelModule()
