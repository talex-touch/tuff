import type {
  AppSetting,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { StorageList } from '@talex-touch/utils'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { AssistantRuntimeConfig } from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { screen } from 'electron'
import {
  AssistantFloatingBallWindowOption,
  AssistantVoicePanelWindowOption
} from '../../config/default'
import { TouchWindow } from '../../core/touch-window'
import { createLogger } from '../../utils/logger'
import { getCoreBoxRendererPath, getCoreBoxRendererUrl, isDevMode } from '../../utils/renderer-url'
import { BaseModule } from '../abstract-base-module'
import { coreBoxManager } from '../box-tool/core-box/manager'
import { windowManager } from '../box-tool/core-box/window'
import { getMainConfig, saveMainConfig, subscribeMainConfig } from '../storage'

interface FloatingBallPosition {
  x: number
  y: number
}

interface FloatingBallSetting {
  enabled: boolean
  size: number
  opacity: number
  edgePadding: number
  position: FloatingBallPosition
}

interface VoiceWakeSetting {
  enabled: boolean
  wakeWords: string[]
  language: string
  continuous: boolean
  cooldownMs: number
  openPanelOnWake: boolean
}

const assistantLog = createLogger('Assistant')
const FLOATING_BALL_DEFAULT_SIZE = 56
const FLOATING_BALL_DEFAULT_PADDING = 24
const VOICE_PANEL_WIDTH = 420
const VOICE_PANEL_HEIGHT = 260
const ASSISTANT_DEFAULT_NAME = '阿洛 aler'
const ASSISTANT_DEFAULT_ID = 'aler'
const ASSISTANT_EXPERIMENT_DEFAULT_ENABLED = false
const ASSISTANT_EXPERIMENT_ENV_KEY = 'TUFF_ENABLE_ASSISTANT_EXPERIMENT'
const DEFAULT_WAKE_WORDS = ['阿洛', 'aler']
const DEFAULT_WAKE_LANGUAGE = 'zh-CN'
const DEFAULT_WAKE_COOLDOWN = 2200

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
  private transportDisposers: Array<() => void> = []
  private unsubscribeAppSetting: (() => void) | null = null
  private floatingBallWindow: TouchWindow | null = null
  private voicePanelWindow: TouchWindow | null = null
  private pendingPosition: FloatingBallPosition | null = null
  private positionSaveTimer: NodeJS.Timeout | null = null

  constructor() {
    super(
      AssistantModule.key,
      {
        create: false
      },
      ASSISTANT_EXPERIMENT_ENV_KEY
    )
  }

  async onInit(_ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    this.ensureSettingsIntegrity()
    this.setupTransport()
    this.registerTransportHandlers()
    this.watchAppSetting()
    await this.applySettingSnapshot(this.readAppSetting())
    assistantLog.success('Assistant module initialized')
  }

  async onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): Promise<void> {
    if (this.positionSaveTimer) {
      clearTimeout(this.positionSaveTimer)
      this.positionSaveTimer = null
    }

    this.pendingPosition = null
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

    this.destroyVoicePanelWindow()
    this.destroyFloatingBallWindow()
  }

  private setupTransport(): void {
    const channel = $app.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)
  }

  private registerTransportHandlers(): void {
    if (!this.transport) {
      return
    }

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.floatingBall.getRuntimeConfig, () => {
        return this.buildRuntimeConfig(this.readAppSetting())
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.floatingBall.openVoicePanel, async (payload) => {
        const source = typeof payload?.source === 'string' ? payload.source : 'click'
        await this.showVoicePanel(source)
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.floatingBall.updatePosition, (payload) => {
        if (!payload || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) {
          return
        }
        this.updateFloatingBallPosition(payload.x, payload.y)
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.closePanel, () => {
        this.hideVoicePanel()
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.submitText, async (payload) => {
        return await this.handleVoiceSubmit(payload?.text)
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
      void this.applySettingSnapshot(nextSetting as AppSetting)
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
        name: ASSISTANT_DEFAULT_NAME,
        identifier: ASSISTANT_DEFAULT_ID,
        enabled: ASSISTANT_EXPERIMENT_DEFAULT_ENABLED
      }
      changed = true
    } else {
      if (typeof setting.assistant.name !== 'string' || !setting.assistant.name.trim()) {
        setting.assistant.name = ASSISTANT_DEFAULT_NAME
        changed = true
      }
      if (
        typeof setting.assistant.identifier !== 'string' ||
        !setting.assistant.identifier.trim()
      ) {
        setting.assistant.identifier = ASSISTANT_DEFAULT_ID
        changed = true
      }
      if (typeof setting.assistant.enabled !== 'boolean') {
        setting.assistant.enabled = ASSISTANT_EXPERIMENT_DEFAULT_ENABLED
        changed = true
      }
    }

    if (!isRecord(setting.floatingBall)) {
      setting.floatingBall = {
        enabled: false,
        size: FLOATING_BALL_DEFAULT_SIZE,
        opacity: 1,
        edgePadding: FLOATING_BALL_DEFAULT_PADDING,
        position: {
          x: -1,
          y: -1
        }
      }
      changed = true
    } else {
      if (typeof setting.floatingBall.enabled !== 'boolean') {
        setting.floatingBall.enabled = false
        changed = true
      }
      if (!Number.isFinite(setting.floatingBall.size)) {
        setting.floatingBall.size = FLOATING_BALL_DEFAULT_SIZE
        changed = true
      }
      if (!Number.isFinite(setting.floatingBall.opacity)) {
        setting.floatingBall.opacity = 1
        changed = true
      }
      if (!Number.isFinite(setting.floatingBall.edgePadding)) {
        setting.floatingBall.edgePadding = FLOATING_BALL_DEFAULT_PADDING
        changed = true
      }
      if (!isRecord(setting.floatingBall.position)) {
        setting.floatingBall.position = { x: -1, y: -1 }
        changed = true
      } else {
        if (!Number.isFinite(setting.floatingBall.position.x)) {
          setting.floatingBall.position.x = -1
          changed = true
        }
        if (!Number.isFinite(setting.floatingBall.position.y)) {
          setting.floatingBall.position.y = -1
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

  private isAssistantExperimentEnabled(setting: AppSetting): boolean {
    return setting.assistant?.enabled === true
  }

  private getFloatingBallSetting(setting: AppSetting): FloatingBallSetting {
    const source = setting.floatingBall as Partial<FloatingBallSetting> | undefined
    const size = Number.isFinite(source?.size) ? Number(source?.size) : FLOATING_BALL_DEFAULT_SIZE
    const opacity = Number.isFinite(source?.opacity) ? Number(source?.opacity) : 1
    const edgePadding = Number.isFinite(source?.edgePadding)
      ? Number(source?.edgePadding)
      : FLOATING_BALL_DEFAULT_PADDING
    const position = source?.position
    return {
      enabled: source?.enabled === true,
      size: Math.round(clamp(size, 48, 72)),
      opacity: clamp(opacity, 0.5, 1),
      edgePadding: Math.round(clamp(edgePadding, 8, 64)),
      position: {
        x: Number.isFinite(position?.x) ? Number(position?.x) : -1,
        y: Number.isFinite(position?.y) ? Number(position?.y) : -1
      }
    }
  }

  private getVoiceWakeSetting(setting: AppSetting): VoiceWakeSetting {
    const source = setting.voiceWake as Partial<VoiceWakeSetting> | undefined
    const wakeWords = Array.isArray(source?.wakeWords) ? source.wakeWords.filter(Boolean) : []
    return {
      enabled: source?.enabled === true,
      wakeWords: wakeWords.length ? wakeWords : [...DEFAULT_WAKE_WORDS],
      language:
        typeof source?.language === 'string' && source.language.trim()
          ? source.language
          : DEFAULT_WAKE_LANGUAGE,
      continuous: source?.continuous !== false,
      cooldownMs: Number.isFinite(source?.cooldownMs)
        ? Math.max(500, Number(source?.cooldownMs))
        : DEFAULT_WAKE_COOLDOWN,
      openPanelOnWake: source?.openPanelOnWake !== false
    }
  }

  private buildRuntimeConfig(setting: AppSetting): AssistantRuntimeConfig {
    const voiceWake = this.getVoiceWakeSetting(setting)
    const assistantEnabled = this.isAssistantExperimentEnabled(setting)
    const assistantName =
      typeof setting.assistant?.name === 'string' && setting.assistant.name.trim()
        ? setting.assistant.name
        : ASSISTANT_DEFAULT_NAME
    return {
      enabled: assistantEnabled && voiceWake.enabled,
      language: voiceWake.language,
      wakeWords: voiceWake.wakeWords,
      cooldownMs: voiceWake.cooldownMs,
      continuous: voiceWake.continuous,
      assistantName,
      openPanelOnWake: assistantEnabled && voiceWake.openPanelOnWake
    }
  }

  private async applySettingSnapshot(setting: AppSetting): Promise<void> {
    if (!this.isAssistantExperimentEnabled(setting)) {
      this.hideVoicePanel()
      this.destroyVoicePanelWindow()
      this.destroyFloatingBallWindow()
      return
    }

    const floatingBall = this.getFloatingBallSetting(setting)
    if (!floatingBall.enabled) {
      this.hideVoicePanel()
      this.destroyVoicePanelWindow()
      this.destroyFloatingBallWindow()
      return
    }

    const floatingWindow = await this.ensureFloatingBallWindow(floatingBall)
    this.applyFloatingBallBounds(floatingWindow, floatingBall)
    if (!floatingWindow.window.isVisible()) {
      floatingWindow.window.showInactive()
    }
  }

  private async ensureFloatingBallWindow(setting: FloatingBallSetting): Promise<TouchWindow> {
    if (this.floatingBallWindow && !this.floatingBallWindow.window.isDestroyed()) {
      return this.floatingBallWindow
    }

    const touchWindow = new TouchWindow({
      ...AssistantFloatingBallWindowOption,
      width: setting.size,
      height: setting.size,
      minWidth: setting.size,
      minHeight: setting.size,
      maxWidth: setting.size,
      maxHeight: setting.size
    })

    touchWindow.window.setAlwaysOnTop(true, 'floating')
    touchWindow.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    touchWindow.window.setFullScreenable(false)
    touchWindow.window.setSkipTaskbar(true)

    touchWindow.window.on('closed', () => {
      this.floatingBallWindow = null
      this.hideVoicePanel()
    })

    await this.loadAssistantRenderer(touchWindow)
    this.floatingBallWindow = touchWindow
    return touchWindow
  }

  private async ensureVoicePanelWindow(): Promise<TouchWindow> {
    if (this.voicePanelWindow && !this.voicePanelWindow.window.isDestroyed()) {
      return this.voicePanelWindow
    }

    const touchWindow = new TouchWindow({
      ...AssistantVoicePanelWindowOption,
      width: VOICE_PANEL_WIDTH,
      height: VOICE_PANEL_HEIGHT
    })

    touchWindow.window.setAlwaysOnTop(true, 'floating')
    touchWindow.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    touchWindow.window.setFullScreenable(false)
    touchWindow.window.setSkipTaskbar(true)

    touchWindow.window.on('blur', () => {
      if (!touchWindow.window.isDestroyed() && touchWindow.window.isVisible()) {
        this.hideVoicePanel()
      }
    })

    touchWindow.window.on('closed', () => {
      this.voicePanelWindow = null
    })

    await this.loadAssistantRenderer(touchWindow)
    this.voicePanelWindow = touchWindow
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

  private applyFloatingBallBounds(window: TouchWindow, setting: FloatingBallSetting): void {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const workArea = display.workArea
    const maxX = workArea.x + workArea.width - setting.size
    const maxY = workArea.y + workArea.height - setting.size
    const defaultX = workArea.x + workArea.width - setting.size - setting.edgePadding
    const defaultY = workArea.y + Math.round(workArea.height * 0.35)
    const xCandidate = setting.position.x >= 0 ? setting.position.x : defaultX
    const yCandidate = setting.position.y >= 0 ? setting.position.y : defaultY

    window.window.setBounds({
      x: clamp(Math.round(xCandidate), workArea.x, maxX),
      y: clamp(Math.round(yCandidate), workArea.y, maxY),
      width: setting.size,
      height: setting.size
    })
    window.window.setOpacity(setting.opacity)
  }

  private updateFloatingBallPosition(x: number, y: number): void {
    const floatingWindow = this.floatingBallWindow
    if (!floatingWindow || floatingWindow.window.isDestroyed()) {
      return
    }

    const bounds = floatingWindow.window.getBounds()
    const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) })
    const workArea = display.workArea
    const maxX = workArea.x + workArea.width - bounds.width
    const maxY = workArea.y + workArea.height - bounds.height
    const nextX = clamp(Math.round(x), workArea.x, maxX)
    const nextY = clamp(Math.round(y), workArea.y, maxY)

    floatingWindow.window.setPosition(nextX, nextY)
    this.pendingPosition = { x: nextX, y: nextY }
    this.schedulePositionPersist()
  }

  private schedulePositionPersist(): void {
    if (this.positionSaveTimer) {
      clearTimeout(this.positionSaveTimer)
    }
    this.positionSaveTimer = setTimeout(() => {
      this.positionSaveTimer = null
      if (!this.pendingPosition) {
        return
      }
      const setting = this.readAppSetting()
      const changed = this.patchAssistantSetting(setting)
      if (changed) {
        saveMainConfig(StorageList.APP_SETTING, setting)
      }
      setting.floatingBall.position = { ...this.pendingPosition }
      saveMainConfig(StorageList.APP_SETTING, setting)
      this.pendingPosition = null
    }, 220)
  }

  private async showVoicePanel(source: string): Promise<void> {
    const setting = this.readAppSetting()
    if (!this.isAssistantExperimentEnabled(setting)) {
      return
    }

    const floatingSetting = this.getFloatingBallSetting(setting)
    if (!floatingSetting.enabled) {
      return
    }

    const floatingWindow = await this.ensureFloatingBallWindow(floatingSetting)
    const voiceWindow = await this.ensureVoicePanelWindow()

    const anchorBounds = floatingWindow.window.getBounds()
    const display = screen.getDisplayNearestPoint({
      x: anchorBounds.x + anchorBounds.width / 2,
      y: anchorBounds.y + anchorBounds.height / 2
    })
    const workArea = display.workArea

    const x = clamp(
      anchorBounds.x + anchorBounds.width + 12,
      workArea.x,
      workArea.x + workArea.width - VOICE_PANEL_WIDTH
    )
    const y = clamp(
      anchorBounds.y - 24,
      workArea.y,
      workArea.y + workArea.height - VOICE_PANEL_HEIGHT
    )

    voiceWindow.window.setBounds({
      x,
      y,
      width: VOICE_PANEL_WIDTH,
      height: VOICE_PANEL_HEIGHT
    })

    if (!voiceWindow.window.isVisible()) {
      voiceWindow.window.show()
    }
    voiceWindow.window.focus()

    if (this.transport) {
      await this.transport.sendTo(
        voiceWindow.window.webContents,
        AssistantEvents.voice.panelOpened,
        {
          source
        }
      )
    }
  }

  private hideVoicePanel(): void {
    if (!this.voicePanelWindow || this.voicePanelWindow.window.isDestroyed()) {
      return
    }
    this.voicePanelWindow.window.hide()
  }

  private async handleVoiceSubmit(rawText?: string): Promise<{ accepted: boolean }> {
    const setting = this.readAppSetting()
    if (!this.isAssistantExperimentEnabled(setting)) {
      return { accepted: false }
    }

    const text = typeof rawText === 'string' ? rawText.trim() : ''
    if (!text) {
      return { accepted: false }
    }

    this.hideVoicePanel()
    const curScreen = windowManager.getCurScreen()
    const currentWindow = windowManager.current
    if (currentWindow) {
      windowManager.updatePosition(currentWindow, curScreen)
    }

    coreBoxManager.trigger(true)

    const targetWindow = windowManager.current?.window
    if (!targetWindow || targetWindow.isDestroyed() || !this.transport) {
      return { accepted: false }
    }

    setTimeout(() => {
      this.transport
        ?.sendTo(targetWindow.webContents, CoreBoxEvents.input.setQuery, { value: text })
        .catch((error) => {
          assistantLog.error('Failed to dispatch voice text to CoreBox', { error })
        })
    }, 120)

    return { accepted: true }
  }

  private destroyFloatingBallWindow(): void {
    if (!this.floatingBallWindow || this.floatingBallWindow.window.isDestroyed()) {
      return
    }
    this.floatingBallWindow.window.destroy()
    this.floatingBallWindow = null
  }

  private destroyVoicePanelWindow(): void {
    if (!this.voicePanelWindow || this.voicePanelWindow.window.isDestroyed()) {
      return
    }
    this.voicePanelWindow.window.destroy()
    this.voicePanelWindow = null
  }
}

export const assistantModule = new AssistantModule()
