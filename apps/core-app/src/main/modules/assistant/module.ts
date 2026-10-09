import type {
  AppSetting,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { StorageList } from '@talex-touch/utils'
import {
  appSettingOriginData,
  normalizeVoicePolishStrength,
  type VoiceInputSetting
} from '@talex-touch/utils/common/storage/entity/app-settings'
import type { AssistantRuntimeConfig } from '@talex-touch/utils/transport/events/assistant'
import type {
  AssistantVoiceCancelHoldPayload,
  AssistantVoiceCommandPayload
} from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import {
  getAppDestinationNavigationService,
  type AppDestinationRuntime
} from '../app-destination/app-destination-navigation'
import { setPlatformVoiceEscapeCapture } from '../voice/command-gesture'
import {
  disableGlobeKeyAction,
  openKeyboardSettings,
  readGlobeKeyStatus
} from '../voice/globe-key-preference'
import { screen, type Rectangle } from 'electron'
import { AssistantVoiceDockWindowOption } from '../../config/default'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { TouchWindow } from '../../core/touch-window'
import { createLogger } from '../../utils/logger'
import { getCoreBoxRendererPath, getCoreBoxRendererUrl, isDevMode } from '../../utils/renderer-url'
import { resolveCapabilityStatus } from '../ai/intelligence-capability-status'
import { BaseModule } from '../abstract-base-module'
import { getMainConfig, saveMainConfig, subscribeMainConfig } from '../storage'

const assistantLog = createLogger('Assistant')
/**
 * The dock window is a transparent canvas, not the visible pill.
 *
 * The pill is 200x44 and animates its own width when a notice expands, so the window has to
 * stay big enough for the widest notice without ever being resized mid-animation — window
 * resizing has no system-level smoothing on Windows or Linux.
 */
const VOICE_DOCK_WIDTH = 360
// 100, not 64: the pill grows to two lines when a message does not fit one, and a window sized
// to the short pill would clip the taller one instead of showing the half that says what to do.
// The slack over the 124px device card is the drop shadow and the breathing glow, which are
// drawn outside the surface and would otherwise be cut off square by the window edge.
const VOICE_DOCK_HEIGHT = 148
/**
 * Air between the dock *window* and the bottom of the work area.
 *
 * Not the gap anyone sees: the window is a transparent canvas taller than the pill, and the
 * pill is centred in it, so what reads as the HUD's distance from the screen edge is this plus
 * the canvas slack below the pill — 9 + 52 = 61 for the short pill. That total is the number to
 * reason about; this constant is just the part main controls.
 *
 * No reserve for a bar that might slide in: the window sits at the `status` level, above the
 * Dock and the taskbar, so a bar appearing under it cannot bury it. Reserving room for that
 * instead pushed the HUD a Dock's height up the screen on every machine, whether or not one was
 * ever going to appear.
 */
const VOICE_DOCK_EDGE_GAP = 9
const ASSISTANT_DEFAULT_ENABLED = false
const DEFAULT_WAKE_WORDS = ['阿洛', 'aler']
const DEFAULT_WAKE_LANGUAGE = 'zh-CN'
const DEFAULT_WAKE_COOLDOWN = 2200

const ESCAPE_CANCEL_HOLD_MS = 600
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export class AssistantModule extends BaseModule {
  static key: symbol = Symbol.for('Assistant')
  name: ModuleKey = AssistantModule.key

  private transport: ITuffTransportMain | null = null
  private destinationRuntime: AppDestinationRuntime | null = null
  private transportDisposers: Array<() => void> = []
  private unsubscribeAppSetting: (() => void) | null = null
  private voiceDockWindow: TouchWindow | null = null
  private voiceDockWindowPending: Promise<TouchWindow> | null = null
  private voiceDockExpanded = false
  private voiceCommandStartPending: Promise<void> | null = null
  private voiceCommandStopPending: AssistantVoiceCommandPayload | null = null
  private escapeCancelTimer: NodeJS.Timeout | null = null
  private escapeCancelHolding = false
  private escapeCancelCommitted = false
  private readonly handleDisplayTopologyChange = (): void => {
    const dock = this.voiceDockWindow
    // Between sessions the dock is hidden and has nothing on screen to keep in place.
    if (!dock || dock.window.isDestroyed() || !this.voiceDockExpanded) {
      return
    }

    if (!this.getVoiceInputSetting(this.readAppSetting()).enabled || !dock.window.isVisible()) {
      return
    }
    this.applyVoiceDockBounds(dock, dock.window.getBounds())
  }

  constructor() {
    super(AssistantModule.key, {
      create: false
    })
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    this.ensureSettingsIntegrity()
    this.setupTransport(ctx)
    this.registerTransportHandlers()
    this.watchAppSetting()
    this.applySettingSnapshot(this.readAppSetting())
    screen.on('display-added', this.handleDisplayTopologyChange)
    screen.on('display-removed', this.handleDisplayTopologyChange)
    screen.on('display-metrics-changed', this.handleDisplayTopologyChange)
    assistantLog.success('Assistant module initialized')
  }

  async onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): Promise<void> {
    screen.off('display-added', this.handleDisplayTopologyChange)
    screen.off('display-removed', this.handleDisplayTopologyChange)
    screen.off('display-metrics-changed', this.handleDisplayTopologyChange)
    this.resetEscapeCancelHold(false, true)
    this.voiceDockExpanded = false
    this.voiceCommandStartPending = null
    this.voiceCommandStopPending = null
    this.unsubscribeAppSetting?.()
    this.unsubscribeAppSetting = null

    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transport = null

    this.destroyVoiceDockWindow()
  }

  private setupTransport(ctx: ModuleInitContext<TalexEvents>): void {
    const runtime = resolveMainRuntime(ctx, 'AssistantModule.onInit')
    const channel = runtime.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)
    this.destinationRuntime = runtime.app
  }

  private registerTransportHandlers(): void {
    if (!this.transport) {
      return
    }

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.getRuntimeConfig, () => {
        return this.buildRuntimeConfig(this.readAppSetting())
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.closePanel, () => {
        this.closeVoicePanel()
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.openIntelligenceSettings, async () => {
        return await this.openIntelligenceSettings()
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.getGlobeKeyStatus, async () => {
        return await readGlobeKeyStatus()
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.disableGlobeKeyAction, async () => {
        return await disableGlobeKeyAction()
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.openKeyboardSettings, async () => {
        return await openKeyboardSettings()
      })
    )
  }

  private watchAppSetting(): void {
    this.unsubscribeAppSetting = subscribeMainConfig(StorageList.APP_SETTING, (nextSetting) => {
      const changed = this.patchAssistantSetting(nextSetting as AppSetting)
      if (changed) {
        saveMainConfig(StorageList.APP_SETTING, nextSetting as AppSetting)
        return
      }
      this.applySettingSnapshot(nextSetting as AppSetting)
    })
  }

  private ensureSettingsIntegrity(): void {
    const setting = this.readAppSetting()
    const changed = this.patchAssistantSetting(setting)
    if (changed) {
      saveMainConfig(StorageList.APP_SETTING, setting)
    }
  }

  private readAppSetting(): AppSetting {
    return getMainConfig(StorageList.APP_SETTING) as AppSetting
  }

  private patchAssistantSetting(setting: AppSetting): boolean {
    let changed = false

    if (!isRecord(setting.assistant)) {
      setting.assistant = {
        enabled: ASSISTANT_DEFAULT_ENABLED
      }
      changed = true
    } else {
      if (typeof setting.assistant.enabled !== 'boolean') {
        setting.assistant.enabled = ASSISTANT_DEFAULT_ENABLED
        changed = true
      }
      const assistantSettings = setting.assistant as Record<string, unknown>
      for (const key of ['name', 'identifier']) {
        if (Object.prototype.hasOwnProperty.call(assistantSettings, key)) {
          delete assistantSettings[key]
          changed = true
        }
      }
    }

    if (!isRecord(setting.voiceWake)) {
      setting.voiceWake = {
        enabled: false,
        wakeWords: [...DEFAULT_WAKE_WORDS],
        language: DEFAULT_WAKE_LANGUAGE,
        continuous: true,
        cooldownMs: DEFAULT_WAKE_COOLDOWN,
        openPanelOnWake: true
      }
      changed = true
    } else {
      if (typeof setting.voiceWake.enabled !== 'boolean') {
        setting.voiceWake.enabled = false
        changed = true
      }
      if (!Array.isArray(setting.voiceWake.wakeWords) || setting.voiceWake.wakeWords.length === 0) {
        setting.voiceWake.wakeWords = [...DEFAULT_WAKE_WORDS]
        changed = true
      }
      if (typeof setting.voiceWake.language !== 'string' || !setting.voiceWake.language.trim()) {
        setting.voiceWake.language = DEFAULT_WAKE_LANGUAGE
        changed = true
      }
      if (typeof setting.voiceWake.continuous !== 'boolean') {
        setting.voiceWake.continuous = true
        changed = true
      }
      if (!Number.isFinite(setting.voiceWake.cooldownMs)) {
        setting.voiceWake.cooldownMs = DEFAULT_WAKE_COOLDOWN
        changed = true
      }
      if (typeof setting.voiceWake.openPanelOnWake !== 'boolean') {
        setting.voiceWake.openPanelOnWake = true
        changed = true
      }
    }

    if (!isRecord(setting.setup)) {
      setting.setup = JSON.parse(JSON.stringify(appSettingOriginData.setup))
      changed = true
    } else if (typeof setting.setup.microphone !== 'boolean') {
      setting.setup.microphone = false
      changed = true
    }

    return changed
  }

  private getVoiceInputSetting(setting: AppSetting): VoiceInputSetting {
    const source = setting.voiceInput as Partial<VoiceInputSetting> | undefined
    return {
      enabled: source?.enabled === true,
      language:
        typeof source?.language === 'string' && source.language.trim()
          ? source.language
          : appSettingOriginData.voiceInput.language,
      polishEnabled: source?.polishEnabled !== false,
      polishStrength: normalizeVoicePolishStrength(source?.polishStrength)
    }
  }

  private buildRuntimeConfig(setting: AppSetting): AssistantRuntimeConfig {
    const voiceInput = this.getVoiceInputSetting(setting)
    const chatStatus = resolveCapabilityStatus('text.chat')
    // `polishAvailable` is what decides between final and live delivery in the HUD, and a
    // false here silently turns tidy-up off entirely. Record the capability it was derived
    // from, so "tidy-up never runs" can be traced to a routing gap rather than guessed at.
    assistantLog.info('Assistant voice runtime config', {
      meta: {
        enabled: voiceInput.enabled,
        polishEnabled: voiceInput.polishEnabled,
        polishAvailable: chatStatus.available,
        polishStrength: voiceInput.polishStrength,
        chatProviders: chatStatus.providerIds.join(',') || '(none)',
        chatReason: chatStatus.reason ?? '(ok)'
      }
    })
    return {
      enabled: voiceInput.enabled,
      language: voiceInput.language,
      polishEnabled: voiceInput.polishEnabled,
      polishAvailable: chatStatus.available,
      polishStrength: voiceInput.polishStrength
    }
  }

  private applySettingSnapshot(setting: AppSetting): void {
    if (!this.getVoiceInputSetting(setting).enabled) {
      this.stopActiveVoiceInput()
      if (this.voiceDockExpanded) {
        this.collapseVoicePanel()
      }
    }

    // There is no resting surface: the dock only exists for a voice session, so outside one it
    // stays hidden. A setting never opens it; only a voice command does.
    if (!this.voiceDockExpanded) {
      this.hideVoicePanel()
    }
  }

  private async ensureVoiceDockWindow(): Promise<TouchWindow> {
    if (this.voiceDockWindow && !this.voiceDockWindow.window.isDestroyed()) {
      return this.voiceDockWindow
    }
    if (this.voiceDockWindowPending) {
      return await this.voiceDockWindowPending
    }

    const pending = this.createVoiceDockWindow()
    this.voiceDockWindowPending = pending
    try {
      return await pending
    } finally {
      if (this.voiceDockWindowPending === pending) {
        this.voiceDockWindowPending = null
      }
    }
  }

  private async createVoiceDockWindow(): Promise<TouchWindow> {
    const touchWindow = new TouchWindow({
      ...AssistantVoiceDockWindowOption,
      width: VOICE_DOCK_WIDTH,
      height: VOICE_DOCK_HEIGHT
    })

    /*
     * `status`, not `floating`.
     *
     * The window is already an NSPanel; what kept the Dock on top of it was the level.
     * `floating` is NSFloatingWindowLevel (3) and the Dock sits at kCGDockWindowLevel (20), so
     * a Dock sliding in covered the HUD. `status` (25) clears it — the HUD draws over the bar
     * instead of hiding from it, which is also why the bottom gap is a plain edge gap again
     * rather than room reserved for a bar that might appear.
     */
    touchWindow.window.setAlwaysOnTop(true, 'status')
    touchWindow.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    touchWindow.window.setFullScreenable(false)
    touchWindow.window.setSkipTaskbar(true)

    touchWindow.window.on('closed', () => {
      if (this.voiceDockWindow === touchWindow) {
        setPlatformVoiceEscapeCapture(false)
        this.voiceDockWindow = null
        this.resetEscapeCancelHold(false, true)
        this.voiceDockExpanded = false
      }
    })

    await this.loadAssistantRenderer(touchWindow)
    this.voiceDockWindow = touchWindow
    return touchWindow
  }

  private async loadAssistantRenderer(window: TouchWindow): Promise<void> {
    try {
      if (isDevMode()) {
        await window.loadURL(getCoreBoxRendererUrl())
      } else {
        await window.loadFile(getCoreBoxRendererPath())
      }
    } catch (error) {
      assistantLog.error('Failed to load assistant renderer', { error })
      throw error
    }
  }

  private applyVoiceDockBounds(window: TouchWindow, anchorBounds: Rectangle): void {
    const display = screen.getDisplayNearestPoint({
      x: anchorBounds.x + anchorBounds.width / 2,
      y: anchorBounds.y + anchorBounds.height / 2
    })
    const workArea = display.workArea
    const x = Math.round(workArea.x + (workArea.width - VOICE_DOCK_WIDTH) / 2)
    const y = workArea.y + workArea.height - VOICE_DOCK_HEIGHT - VOICE_DOCK_EDGE_GAP

    window.window.setBounds({
      x: clamp(x, workArea.x, workArea.x + Math.max(0, workArea.width - VOICE_DOCK_WIDTH)),
      y: clamp(y, workArea.y, workArea.y + Math.max(0, workArea.height - VOICE_DOCK_HEIGHT)),
      width: VOICE_DOCK_WIDTH,
      height: VOICE_DOCK_HEIGHT
    })
  }

  /** True while the VoiceDock is open or its first renderer window is still being created. */
  isVoiceCommandActive(): boolean {
    return (
      this.voiceDockExpanded ||
      this.voiceDockWindowPending !== null ||
      this.voiceCommandStartPending !== null
    )
  }

  private stopActiveVoiceInput(): void {
    this.resetEscapeCancelHold(false, true)
    if (this.voiceCommandStartPending || this.voiceDockWindowPending) {
      this.voiceCommandStopPending = { action: 'stop', mode: 'toggle', source: 'command' }
    }
    const dock = this.voiceDockWindow
    if (!this.voiceDockExpanded || !dock || dock.window.isDestroyed() || !this.transport) {
      return
    }
    this.transport.broadcastToWindow(dock.window.id, AssistantEvents.voice.command, {
      action: 'stop',
      mode: 'toggle',
      source: 'command'
    })
  }

  async handleVoiceCommandGesture(payload: AssistantVoiceCommandPayload): Promise<void> {
    if (payload.action === 'cancel') {
      this.handleVoiceCancelGesture(payload.state)
      return
    }

    const setting = this.readAppSetting()
    if (!this.getVoiceInputSetting(setting).enabled) {
      return
    }
    if (payload.action === 'toggle' && this.voiceCommandStartPending) {
      this.voiceCommandStopPending = { action: 'stop', mode: 'toggle', source: 'command' }
      return
    }
    if (payload.action === 'stop') {
      if (!this.voiceDockExpanded) {
        if (this.voiceCommandStartPending || this.voiceDockWindowPending) {
          this.voiceCommandStopPending = payload
        }
        return
      }
      const dock = this.voiceDockWindow
      if (!dock || dock.window.isDestroyed() || !this.transport) return
      this.voiceCommandStopPending = null
      this.transport.broadcastToWindow(dock.window.id, AssistantEvents.voice.command, payload)
      return
    }

    this.resetEscapeCancelHold(false, true)
    // A hidden dock has no mounted VoicePanel yet. `panelOpened` starts the session after the
    // renderer has mounted; sending a second command here can race that handoff and leave the
    // first session reset by `openPanel()`.
    if (this.voiceCommandStartPending) return
    if (!this.voiceDockExpanded) {
      this.voiceCommandStopPending = null
      const opening = this.showVoicePanel('command')
      this.voiceCommandStartPending = opening
      try {
        await opening
      } catch {
        this.voiceCommandStopPending = null
        return
      } finally {
        if (this.voiceCommandStartPending === opening) {
          this.voiceCommandStartPending = null
        }
      }

      if (this.escapeCancelCommitted) {
        this.voiceCommandStopPending = null
        return
      }
      if (this.voiceCommandStopPending) {
        const stopPayload = this.voiceCommandStopPending
        this.voiceCommandStopPending = null
        const dock = this.voiceDockWindow
        if (dock && !dock.window.isDestroyed() && this.transport) {
          this.transport.broadcastToWindow(
            dock.window.id,
            AssistantEvents.voice.command,
            stopPayload
          )
        }
      }
      return
    }

    const dock = this.voiceDockWindow
    if (!dock || dock.window.isDestroyed() || !this.transport) return
    this.transport.broadcastToWindow(dock.window.id, AssistantEvents.voice.command, payload)
  }

  private handleVoiceCancelGesture(state: 'start' | 'reset'): void {
    if (state === 'reset') {
      this.resetEscapeCancelHold(true)
      return
    }
    if (!this.isVoiceCommandActive() || this.escapeCancelHolding) return

    this.escapeCancelHolding = true
    this.broadcastVoiceCancelHold('start')
    this.escapeCancelTimer = setTimeout(() => {
      this.escapeCancelTimer = null
      if (!this.escapeCancelHolding) return
      this.escapeCancelHolding = false
      this.escapeCancelCommitted = true
      this.broadcastVoiceCancelHold('commit')
    }, ESCAPE_CANCEL_HOLD_MS)
  }

  private resetEscapeCancelHold(notify: boolean, clearCommit = false): void {
    const wasHolding = this.escapeCancelHolding || this.escapeCancelTimer !== null
    if (this.escapeCancelTimer) {
      clearTimeout(this.escapeCancelTimer)
      this.escapeCancelTimer = null
    }
    this.escapeCancelHolding = false
    if (clearCommit) this.escapeCancelCommitted = false
    if (notify && wasHolding) this.broadcastVoiceCancelHold('reset')
  }

  private broadcastVoiceCancelHold(state: AssistantVoiceCancelHoldPayload['state']): void {
    const dock = this.voiceDockWindow
    if (!dock || dock.window.isDestroyed() || !this.transport) return
    this.transport.broadcastToWindow(dock.window.id, AssistantEvents.voice.cancelHold, { state })
  }

  private async showVoicePanel(source: string): Promise<void> {
    if (!this.getVoiceInputSetting(this.readAppSetting()).enabled) {
      return
    }

    const dock = await this.ensureVoiceDockWindow()
    if (!this.getVoiceInputSetting(this.readAppSetting()).enabled || this.escapeCancelCommitted) {
      return
    }
    const anchorBounds = dock.window.getBounds()

    setPlatformVoiceEscapeCapture(true)
    this.voiceDockExpanded = true
    this.applyVoiceDockBounds(dock, anchorBounds)
    if (!dock.window.isVisible()) {
      dock.window.showInactive()
    }

    if (this.transport) {
      this.transport.broadcastToWindow(dock.window.id, AssistantEvents.voice.panelOpened, {
        source
      })
    }
  }

  private hideVoicePanel(): void {
    const dockWindow = this.voiceDockWindow?.window
    if (!dockWindow || dockWindow.isDestroyed()) {
      return
    }
    dockWindow.hide()
  }

  private collapseVoicePanel(): void {
    setPlatformVoiceEscapeCapture(false)
    this.voiceCommandStopPending = null
    this.resetEscapeCancelHold(false, true)
    const dock = this.voiceDockWindow
    if (!dock || dock.window.isDestroyed() || !this.voiceDockExpanded) {
      return
    }

    this.voiceDockExpanded = false
    dock.window.hide()
    this.transport?.broadcastToWindow(dock.window.id, AssistantEvents.voice.panelClosed, undefined)
  }

  private closeVoicePanel(): void {
    this.collapseVoicePanel()
  }

  private async openIntelligenceSettings(): Promise<boolean> {
    const runtime = this.destinationRuntime
    if (!runtime) {
      return false
    }

    const result = getAppDestinationNavigationService(runtime).open('settings-channels')
    if (result.status === 'unavailable') {
      assistantLog.warn('Intelligence settings destination unavailable from Assistant', {
        error: result.reason
      })
      return false
    }

    this.collapseVoicePanel()
    return true
  }

  private destroyVoiceDockWindow(): void {
    setPlatformVoiceEscapeCapture(false)
    this.resetEscapeCancelHold(false, true)
    this.voiceCommandStopPending = null
    if (!this.voiceDockWindow || this.voiceDockWindow.window.isDestroyed()) {
      return
    }
    this.voiceDockWindow.window.destroy()
    this.voiceDockWindow = null
    this.voiceDockExpanded = false
  }
}

export const assistantModule = new AssistantModule()
