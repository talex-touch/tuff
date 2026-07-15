import type {
  AppSetting,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import type {
  IntelligenceInvokeResult,
  IntelligenceVisionOcrResult
} from '@talex-touch/tuff-intelligence'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { StorageList } from '@talex-touch/utils'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'
import type {
  AssistantClipboardImageTranslateResponse,
  AssistantRuntimeConfig,
  AssistantScreenshotDisplay,
  AssistantScreenshotFallbackReason,
  AssistantScreenshotCapturePayload,
  AssistantScreenshotCaptureResponse,
  AssistantScreenshotSavePayload,
  AssistantScreenshotRegionSelectionPayload,
  AssistantScreenshotRegionSelectionResponse,
  AssistantScreenshotSaveResponse,
  AssistantScreenshotTargetPayload,
  AssistantScreenshotTranslatePayload,
  AssistantScreenshotTranslateResponse
} from '@talex-touch/utils/transport/events/assistant'
import type {
  IntelligenceErrorCode,
  NativeScreenshotCaptureRequest,
  NativeScreenshotRegion,
  NativeScreenshotCaptureResult
} from '@talex-touch/utils/transport/events/types'
import { isIntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { AppEvents, CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import fs from 'node:fs/promises'
import { dialog, screen, type BrowserWindow, type SaveDialogOptions } from 'electron'
import {
  AssistantFloatingBallWindowOption,
  AssistantRegionSelectorWindowOption,
  AssistantVoicePanelWindowOption
} from '../../config/default'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { TouchWindow } from '../../core/touch-window'
import { createLogger } from '../../utils/logger'
import { getCoreBoxRendererPath, getCoreBoxRendererUrl, isDevMode } from '../../utils/renderer-url'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { normalizeIntelligenceError } from '../ai/intelligence-error-normalizer'
import { BaseModule } from '../abstract-base-module'
import { coreBoxManager } from '../box-tool/core-box/manager'
import {
  normalizeImageBase64Payload,
  translateClipboardImage,
  translateImageBase64
} from '../box-tool/core-box/image-translate'
import { windowManager } from '../box-tool/core-box/window'
import { getNativeScreenshotService } from '../native-capabilities/screenshot-service'
import { getMainConfig, persistMainConfig, saveMainConfig, subscribeMainConfig } from '../storage'

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

interface PendingScreenshotRegionSelection {
  display: AssistantScreenshotDisplay
  resolve: (response: AssistantScreenshotRegionSelectionResponse) => void
  timeout: NodeJS.Timeout | null
  window: TouchWindow | null
}

type ScreenshotUnavailableCode =
  | 'SCREENSHOT_PERMISSION_DENIED'
  | 'SCREENSHOT_UNSUPPORTED'
  | 'SCREENSHOT_UNAVAILABLE'

const assistantLog = createLogger('Assistant')
const FLOATING_BALL_DEFAULT_SIZE = 56
const FLOATING_BALL_DEFAULT_PADDING = 24
const VOICE_PANEL_WIDTH = 420
const VOICE_PANEL_HEIGHT = 260
const ASSISTANT_DEFAULT_NAME = '阿洛 aler'
const ASSISTANT_DEFAULT_ID = 'aler'
const ASSISTANT_DEFAULT_ENABLED = false
const DEFAULT_WAKE_WORDS = ['阿洛', 'aler']
const DEFAULT_WAKE_LANGUAGE = 'zh-CN'
const DEFAULT_WAKE_COOLDOWN = 2200
const REGION_SELECTION_TIMEOUT_MS = 60_000
const REGION_CAPTURE_PANEL_RESTORE_TIMEOUT_MS = 3_000
const ASSISTANT_SCREENSHOT_TRANSLATE_CALLER = 'core.assistant.screenshot-translate'
const ASSISTANT_SCREENSHOT_FALLBACK_SOURCE = 'assistant-screenshot-ocr-fallback'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getErrorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined
}

function mapScreenshotUnavailableCode(error: unknown): ScreenshotUnavailableCode {
  const code = getErrorCode(error)
  if (code === 'ERR_NATIVE_SCREENSHOT_UNSUPPORTED') {
    return 'SCREENSHOT_UNSUPPORTED'
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (
    message.includes('permission') ||
    message.includes('denied') ||
    message.includes('not authorized')
  ) {
    return 'SCREENSHOT_PERMISSION_DENIED'
  }

  return 'SCREENSHOT_UNAVAILABLE'
}

function toAssistantIntelligenceFailure(
  error: unknown,
  capabilityId: string,
  fallback: {
    code: 'OCR_UNAVAILABLE' | 'TEXT_TRANSLATE_UNAVAILABLE'
    error: string
  }
): {
  code: IntelligenceErrorCode | 'OCR_UNAVAILABLE' | 'TEXT_TRANSLATE_UNAVAILABLE'
  error: string
  reason?: string
  recovery?: string
} {
  const normalized = normalizeIntelligenceError(error, { capabilityId })
  if (normalized.code === 'UNKNOWN') return fallback

  return {
    code: normalized.code,
    error: normalized.reason,
    reason: normalized.reason,
    recovery: normalized.recovery
  }
}

function normalizeScreenshotRegion(value: unknown): NativeScreenshotRegion | null {
  if (!isRecord(value)) return null
  const x = value.x
  const y = value.y
  const width = value.width
  const height = value.height
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return null
  }
  return { x, y, width, height }
}

function normalizeScreenshotTarget(
  payload?: AssistantScreenshotTargetPayload
): Pick<NativeScreenshotCaptureRequest, 'target' | 'displayId' | 'region'> {
  const displayId = typeof payload?.displayId === 'string' ? payload.displayId.trim() : ''
  if (payload?.target === 'region') {
    const region = normalizeScreenshotRegion(payload.region)
    return {
      target: 'region',
      ...(displayId ? { displayId } : {}),
      ...(region ? { region } : {})
    }
  }
  if (payload?.target === 'display') {
    return displayId ? { target: 'display', displayId } : { target: 'display' }
  }
  return { target: 'cursor-display' }
}

export class AssistantModule extends BaseModule {
  static key: symbol = Symbol.for('Assistant')
  name: ModuleKey = AssistantModule.key

  private transport: ITuffTransportMain | null = null
  private mainWindow: BrowserWindow | null = null
  private transportDisposers: Array<() => void> = []
  private unsubscribeAppSetting: (() => void) | null = null
  private floatingBallWindow: TouchWindow | null = null
  private floatingBallWindowPending: Promise<TouchWindow> | null = null
  private voicePanelWindow: TouchWindow | null = null
  private voicePanelWindowPending: Promise<TouchWindow> | null = null
  private pendingRegionSelection: PendingScreenshotRegionSelection | null = null
  private regionCapturePanelRestorePending = false
  private regionCapturePanelRestoreTimer: NodeJS.Timeout | null = null
  private voicePanelAutoHideSuppressionDepth = 0
  private voicePanelAutoHideResumeTimer: NodeJS.Timeout | null = null
  private pendingPosition: FloatingBallPosition | null = null
  private positionSaveTimer: NodeJS.Timeout | null = null

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
    await this.applySettingSnapshot(this.readAppSetting())
    assistantLog.success('Assistant module initialized')
  }

  async onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): Promise<void> {
    if (this.positionSaveTimer) {
      clearTimeout(this.positionSaveTimer)
      this.positionSaveTimer = null
    }
    if (this.voicePanelAutoHideResumeTimer) {
      clearTimeout(this.voicePanelAutoHideResumeTimer)
      this.voicePanelAutoHideResumeTimer = null
    }

    this.pendingPosition = null
    this.voicePanelAutoHideSuppressionDepth = 0
    this.finishPendingRegionSelection(
      {
        success: false,
        canceled: true
      },
      false
    )
    this.clearRegionCapturePanelRestore(false)
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
    this.mainWindow = null

    this.destroyVoicePanelWindow()
    this.destroyFloatingBallWindow()
  }

  private setupTransport(ctx: ModuleInitContext<TalexEvents>): void {
    const runtime = resolveMainRuntime(ctx, 'AssistantModule.onInit')
    const channel = runtime.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)
    this.mainWindow = runtime.window?.window ?? runtime.app.window?.window ?? null
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
      this.transport.on(AssistantEvents.voice.openIntelligenceSettings, async () => {
        return await this.openIntelligenceSettings()
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.submitText, async (payload) => {
        return await this.handleVoiceSubmit(payload?.text, payload?.source)
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.translateClipboardImage, async (payload) => {
        return await this.handleClipboardImageTranslate(payload?.targetLang)
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.listScreenshotDisplays, () => {
        const setting = this.readAppSetting()
        if (!this.isAssistantEnabled(setting) || !this.getFloatingBallSetting(setting).enabled) {
          return []
        }
        return getNativeScreenshotService().listDisplays()
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.selectScreenshotRegion, async (payload) => {
        return await this.handleScreenshotRegionSelection(payload || undefined)
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.regionSelection.submit, (payload, context) => {
        return this.submitScreenshotRegionSelection(payload, context)
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.regionSelection.cancel, (_payload, context) => {
        return this.cancelScreenshotRegionSelection(context)
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.captureScreenshot, async (payload) => {
        return await this.handleScreenshotCapture(payload || undefined)
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.saveScreenshot, async (payload) => {
        return await this.handleScreenshotSave(payload || undefined)
      })
    )

    this.transportDisposers.push(
      this.transport.on(AssistantEvents.voice.translateScreenshot, async (payload) => {
        return await this.handleScreenshotTranslate(payload || undefined)
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
        enabled: ASSISTANT_DEFAULT_ENABLED
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
        setting.assistant.enabled = ASSISTANT_DEFAULT_ENABLED
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

  private isAssistantEnabled(setting: AppSetting): boolean {
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
    const assistantEnabled = this.isAssistantEnabled(setting)
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
    if (!this.isAssistantEnabled(setting)) {
      this.finishPendingRegionSelection({ success: false, canceled: true }, false)
      this.clearRegionCapturePanelRestore(false)
      this.hideVoicePanel()
      this.destroyVoicePanelWindow()
      this.destroyFloatingBallWindow()
      return
    }

    const floatingBall = this.getFloatingBallSetting(setting)
    if (!floatingBall.enabled) {
      this.finishPendingRegionSelection({ success: false, canceled: true }, false)
      this.clearRegionCapturePanelRestore(false)
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

  private resolveScreenshotRegionDisplay(
    payload?: AssistantScreenshotRegionSelectionPayload
  ): AssistantScreenshotDisplay | null {
    const displays = getNativeScreenshotService().listDisplays()
    if (displays.length === 0) return null

    const displayId = typeof payload?.displayId === 'string' ? payload.displayId.trim() : ''
    if (payload?.target === 'display') {
      return displayId ? displays.find((display) => display.id === displayId) || null : null
    }

    const cursor = screen.getCursorScreenPoint()
    return (
      displays.find(
        (display) =>
          cursor.x >= display.x &&
          cursor.x < display.x + display.width &&
          cursor.y >= display.y &&
          cursor.y < display.y + display.height
      ) ||
      displays.find((display) => display.isPrimary) ||
      displays[0] ||
      null
    )
  }

  private async handleScreenshotRegionSelection(
    payload?: AssistantScreenshotRegionSelectionPayload
  ): Promise<AssistantScreenshotRegionSelectionResponse> {
    const setting = this.readAppSetting()
    if (!this.isAssistantEnabled(setting) || !this.getFloatingBallSetting(setting).enabled) {
      return {
        success: false,
        code: 'ASSISTANT_DISABLED',
        error: 'Assistant floating ball is disabled.'
      }
    }

    const support = getNativeScreenshotService().getSupport()
    if (!support.supported) {
      return {
        success: false,
        code: 'SCREENSHOT_UNSUPPORTED',
        error: support.reason || 'Native screenshot is unsupported.'
      }
    }
    if (this.pendingRegionSelection) {
      return {
        success: false,
        code: 'REGION_SELECTION_UNAVAILABLE',
        error: 'A screenshot region selection is already active.'
      }
    }

    const display = this.resolveScreenshotRegionDisplay(payload)
    if (!display || display.width <= 0 || display.height <= 0) {
      return {
        success: false,
        code: 'REGION_SELECTION_UNAVAILABLE',
        error: 'Unable to resolve a display for screenshot region selection.'
      }
    }

    this.hideVoicePanel()
    return await new Promise<AssistantScreenshotRegionSelectionResponse>((resolve) => {
      const pending: PendingScreenshotRegionSelection = {
        display,
        resolve,
        timeout: null,
        window: null
      }
      this.pendingRegionSelection = pending
      pending.timeout = setTimeout(() => {
        if (this.pendingRegionSelection === pending) {
          this.finishPendingRegionSelection({ success: false, canceled: true }, true)
        }
      }, REGION_SELECTION_TIMEOUT_MS)

      void this.openScreenshotRegionSelector(pending).catch((error) => {
        if (this.pendingRegionSelection !== pending) return
        this.finishPendingRegionSelection(
          {
            success: false,
            code: 'REGION_SELECTION_UNAVAILABLE',
            error:
              error instanceof Error ? error.message : 'Screenshot region selector is unavailable.'
          },
          true
        )
      })
    })
  }

  private async openScreenshotRegionSelector(
    pending: PendingScreenshotRegionSelection
  ): Promise<void> {
    const display = pending.display
    const touchWindow = new TouchWindow({
      ...AssistantRegionSelectorWindowOption,
      x: display.x,
      y: display.y,
      width: display.width,
      height: display.height
    })
    if (this.pendingRegionSelection !== pending) {
      touchWindow.window.destroy()
      return
    }

    pending.window = touchWindow
    touchWindow.window.setAlwaysOnTop(true, 'screen-saver')
    touchWindow.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    touchWindow.window.setFullScreenable(false)
    touchWindow.window.setSkipTaskbar(true)
    touchWindow.window.on('closed', () => {
      if (this.pendingRegionSelection === pending) {
        this.finishPendingRegionSelection({ success: false, canceled: true }, true)
      }
    })

    await this.loadAssistantRenderer(touchWindow)
    if (this.pendingRegionSelection !== pending || touchWindow.window.isDestroyed()) return
    touchWindow.window.show()
    touchWindow.window.focus()
  }

  private submitScreenshotRegionSelection(
    payload: NativeScreenshotRegion,
    context: HandlerContext
  ): { accepted: boolean } {
    const pending = this.pendingRegionSelection
    if (!pending || !this.isRegionSelectionSender(pending, context)) {
      return { accepted: false }
    }

    const localRegion = normalizeScreenshotRegion(payload)
    if (
      !localRegion ||
      localRegion.width < 4 ||
      localRegion.height < 4 ||
      pending.display.width <= 0 ||
      pending.display.height <= 0
    ) {
      return { accepted: false }
    }

    const localX = clamp(Math.round(localRegion.x), 0, pending.display.width - 1)
    const localY = clamp(Math.round(localRegion.y), 0, pending.display.height - 1)
    const width = clamp(Math.round(localRegion.width), 1, pending.display.width - localX)
    const height = clamp(Math.round(localRegion.height), 1, pending.display.height - localY)
    const region: NativeScreenshotRegion = {
      x: pending.display.x + localX,
      y: pending.display.y + localY,
      width,
      height
    }

    this.deferRegionCapturePanelRestore()
    this.finishPendingRegionSelection(
      {
        success: true,
        region,
        displayId: pending.display.id,
        displayName: pending.display.friendlyName?.trim() || pending.display.name
      },
      false
    )
    return { accepted: true }
  }

  private cancelScreenshotRegionSelection(context: HandlerContext): { accepted: boolean } {
    const pending = this.pendingRegionSelection
    if (!pending || !this.isRegionSelectionSender(pending, context)) {
      return { accepted: false }
    }
    this.finishPendingRegionSelection({ success: false, canceled: true }, true)
    return { accepted: true }
  }

  private isRegionSelectionSender(
    pending: PendingScreenshotRegionSelection,
    context: HandlerContext
  ): boolean {
    const selectorId = pending.window?.window.webContents.id
    return typeof selectorId === 'number' && context.sender.id === selectorId
  }

  private finishPendingRegionSelection(
    response: AssistantScreenshotRegionSelectionResponse,
    restorePanel: boolean
  ): boolean {
    const pending = this.pendingRegionSelection
    if (!pending) return false
    this.pendingRegionSelection = null
    clearTimeout(pending.timeout ?? undefined)
    pending.timeout = null

    const selectorWindow = pending.window?.window
    if (selectorWindow && !selectorWindow.isDestroyed()) {
      selectorWindow.destroy()
    }
    if (restorePanel) {
      this.restoreVoicePanelWindow()
    }
    pending.resolve(response)
    return true
  }

  private deferRegionCapturePanelRestore(): void {
    clearTimeout(this.regionCapturePanelRestoreTimer ?? undefined)
    this.regionCapturePanelRestorePending = true
    this.regionCapturePanelRestoreTimer = setTimeout(() => {
      this.clearRegionCapturePanelRestore(true)
    }, REGION_CAPTURE_PANEL_RESTORE_TIMEOUT_MS)
  }

  private claimRegionCapturePanelRestore(payload?: AssistantScreenshotTargetPayload): boolean {
    if (payload?.target !== 'region' || !this.regionCapturePanelRestorePending) return false
    if (this.regionCapturePanelRestoreTimer) {
      clearTimeout(this.regionCapturePanelRestoreTimer)
      this.regionCapturePanelRestoreTimer = null
    }
    return true
  }

  private clearRegionCapturePanelRestore(restorePanel: boolean): void {
    if (this.regionCapturePanelRestoreTimer) {
      clearTimeout(this.regionCapturePanelRestoreTimer)
      this.regionCapturePanelRestoreTimer = null
    }
    const shouldRestore = this.regionCapturePanelRestorePending
    this.regionCapturePanelRestorePending = false
    if (restorePanel && shouldRestore) {
      this.restoreVoicePanelWindow()
    }
  }

  private restoreVoicePanelWindow(): void {
    const voiceWindow = this.voicePanelWindow?.window
    if (!voiceWindow || voiceWindow.isDestroyed()) return
    if (!voiceWindow.isVisible()) voiceWindow.show()
    voiceWindow.focus()
  }

  private async ensureFloatingBallWindow(setting: FloatingBallSetting): Promise<TouchWindow> {
    if (this.floatingBallWindow && !this.floatingBallWindow.window.isDestroyed()) {
      return this.floatingBallWindow
    }
    if (this.floatingBallWindowPending) {
      return await this.floatingBallWindowPending
    }

    const pending = this.createFloatingBallWindow(setting)
    this.floatingBallWindowPending = pending
    try {
      return await pending
    } finally {
      if (this.floatingBallWindowPending === pending) {
        this.floatingBallWindowPending = null
      }
    }
  }

  private async createFloatingBallWindow(setting: FloatingBallSetting): Promise<TouchWindow> {
    const touchWindow = new TouchWindow({
      ...AssistantFloatingBallWindowOption,
      width: setting.size,
      height: setting.size,
      minWidth: setting.size,
      minHeight: setting.size,
      maxWidth: setting.size,
      maxHeight: setting.size
    })

    // Floating ball stays visible on every macOS Space and full-screen app
    // so the voice assistant is always one click away regardless of context.
    touchWindow.window.setAlwaysOnTop(true, 'floating')
    touchWindow.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    touchWindow.window.setFullScreenable(false)
    touchWindow.window.setSkipTaskbar(true)

    touchWindow.window.on('closed', () => {
      if (this.floatingBallWindow === touchWindow) {
        this.floatingBallWindow = null
      }
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
    if (this.voicePanelWindowPending) {
      return await this.voicePanelWindowPending
    }

    const pending = this.createVoicePanelWindow()
    this.voicePanelWindowPending = pending
    try {
      return await pending
    } finally {
      if (this.voicePanelWindowPending === pending) {
        this.voicePanelWindowPending = null
      }
    }
  }

  private async createVoicePanelWindow(): Promise<TouchWindow> {
    const touchWindow = new TouchWindow({
      ...AssistantVoicePanelWindowOption,
      width: VOICE_PANEL_WIDTH,
      height: VOICE_PANEL_HEIGHT
    })

    // Voice panel mirrors floating-ball visibility: always accessible across
    // all Spaces and full-screen apps.
    touchWindow.window.setAlwaysOnTop(true, 'floating')
    touchWindow.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    touchWindow.window.setFullScreenable(false)
    touchWindow.window.setSkipTaskbar(true)

    touchWindow.window.on('blur', () => {
      if (this.voicePanelAutoHideSuppressionDepth > 0) {
        return
      }
      if (!touchWindow.window.isDestroyed() && touchWindow.window.isVisible()) {
        this.hideVoicePanel()
      }
    })

    touchWindow.window.on('closed', () => {
      if (this.voicePanelWindow === touchWindow) {
        this.voicePanelWindow = null
      }
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
      saveMainConfig(StorageList.APP_SETTING, setting, { force: true })
      this.pendingPosition = null
      void persistMainConfig(StorageList.APP_SETTING).catch((error) => {
        assistantLog.warn('Failed to persist floating ball position immediately', { error })
      })
    }, 220)
  }

  private async showVoicePanel(source: string): Promise<void> {
    const setting = this.readAppSetting()
    if (!this.isAssistantEnabled(setting)) {
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

    this.beginVoicePanelAutoHideSuppression()
    try {
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
        this.transport.broadcastToWindow(voiceWindow.window.id, AssistantEvents.voice.panelOpened, {
          source
        })
      }
    } finally {
      this.releaseVoicePanelAutoHideSuppression()
    }
  }

  private hideVoicePanel(): void {
    if (!this.voicePanelWindow || this.voicePanelWindow.window.isDestroyed()) {
      return
    }
    this.voicePanelWindow.window.hide()
  }

  private async openIntelligenceSettings(): Promise<boolean> {
    const mainWindow = this.mainWindow
    const transport = this.transport
    if (!mainWindow || mainWindow.isDestroyed() || !transport) {
      return false
    }

    try {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
      await transport.sendTo(mainWindow.webContents, AppEvents.window.navigate, {
        path: '/intelligence/channels'
      })
      this.hideVoicePanel()
      return true
    } catch (error) {
      assistantLog.warn('Failed to open Intelligence settings from Assistant', { error })
      return false
    }
  }

  private beginVoicePanelAutoHideSuppression(): void {
    if (this.voicePanelAutoHideResumeTimer) {
      clearTimeout(this.voicePanelAutoHideResumeTimer)
      this.voicePanelAutoHideResumeTimer = null
    }
    this.voicePanelAutoHideSuppressionDepth += 1
  }

  private releaseVoicePanelAutoHideSuppression(): void {
    if (this.voicePanelAutoHideResumeTimer) {
      clearTimeout(this.voicePanelAutoHideResumeTimer)
    }
    this.voicePanelAutoHideResumeTimer = setTimeout(() => {
      this.voicePanelAutoHideResumeTimer = null
      this.voicePanelAutoHideSuppressionDepth = Math.max(
        0,
        this.voicePanelAutoHideSuppressionDepth - 1
      )
    }, 600)
  }

  private async handleVoiceSubmit(
    rawText?: string,
    rawSource?: string
  ): Promise<{ accepted: boolean }> {
    const setting = this.readAppSetting()
    if (!this.isAssistantEnabled(setting)) {
      return { accepted: false }
    }

    const text = typeof rawText === 'string' ? rawText.trim() : ''
    if (!text) {
      return { accepted: false }
    }

    const source = typeof rawSource === 'string' && rawSource.trim() ? rawSource.trim() : 'voice'

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
        ?.sendTo(targetWindow.webContents, CoreBoxEvents.input.setQuery, {
          value: `ai ${text}`,
          context: {
            entrypoint: {
              id: 'assistant.voice',
              source,
              execution: {
                mode: 'new',
                owner: 'assistant',
                scope: 'light',
                objective: 'Assistant voice request',
                isolated: true
              }
            }
          }
        })
        .catch((error) => {
          assistantLog.error('Failed to dispatch voice text to CoreBox', { error })
        })
    }, 120)

    return { accepted: true }
  }

  private async handleClipboardImageTranslate(
    targetLang?: string
  ): Promise<AssistantClipboardImageTranslateResponse> {
    const setting = this.readAppSetting()
    if (!this.isAssistantEnabled(setting) || !this.getFloatingBallSetting(setting).enabled) {
      return {
        success: false,
        code: 'ASSISTANT_DISABLED',
        error: 'Assistant floating ball is disabled.'
      }
    }

    this.beginVoicePanelAutoHideSuppression()
    try {
      const result = await translateClipboardImage(targetLang || 'zh', {
        openPinWindow: true
      })
      if (!result.success) {
        const code = isIntelligenceErrorCode(result.code)
          ? result.code
          : result.code === 'SCENE_UNAVAILABLE'
            ? 'SCENE_UNAVAILABLE'
            : 'IMAGE_UNAVAILABLE'
        return {
          success: false,
          code,
          error: result.error,
          reason: result.reason,
          recovery: result.recovery
        }
      }

      return {
        success: true,
        translatedImageBase64: result.translatedImageBase64,
        sourceText: result.sourceText,
        targetText: result.targetText,
        metadata: result.metadata
      }
    } finally {
      this.releaseVoicePanelAutoHideSuppression()
    }
  }

  private async handleScreenshotCapture(
    payload?: AssistantScreenshotCapturePayload
  ): Promise<AssistantScreenshotCaptureResponse> {
    const setting = this.readAppSetting()
    if (!this.isAssistantEnabled(setting) || !this.getFloatingBallSetting(setting).enabled) {
      return {
        success: false,
        code: 'ASSISTANT_DISABLED',
        error: 'Assistant floating ball is disabled.'
      }
    }

    this.beginVoicePanelAutoHideSuppression()
    try {
      const restorePanelAfterCapture = this.claimRegionCapturePanelRestore(payload)
      let captureResult: NativeScreenshotCaptureResult
      try {
        captureResult = await getNativeScreenshotService().capture({
          ...normalizeScreenshotTarget(payload),
          output: 'data-url',
          writeClipboard: true
        })
      } finally {
        if (restorePanelAfterCapture) this.clearRegionCapturePanelRestore(true)
      }
      if (typeof captureResult.dataUrl !== 'string' || !captureResult.dataUrl.trim()) {
        return {
          success: false,
          code: 'SCREENSHOT_UNAVAILABLE',
          error: 'Screenshot image is unavailable.'
        }
      }

      return {
        success: true,
        dataUrl: captureResult.dataUrl,
        mimeType: captureResult.mimeType,
        width: captureResult.width,
        height: captureResult.height,
        displayName: captureResult.displayName,
        wroteClipboard: captureResult.wroteClipboard
      }
    } catch (error) {
      return {
        success: false,
        code: mapScreenshotUnavailableCode(error),
        error: error instanceof Error ? error.message : 'Native screenshot is unavailable.'
      }
    } finally {
      this.releaseVoicePanelAutoHideSuppression()
    }
  }

  private async handleScreenshotSave(
    payload?: AssistantScreenshotSavePayload
  ): Promise<AssistantScreenshotSaveResponse> {
    const setting = this.readAppSetting()
    if (!this.isAssistantEnabled(setting) || !this.getFloatingBallSetting(setting).enabled) {
      return {
        success: false,
        code: 'ASSISTANT_DISABLED',
        error: 'Assistant floating ball is disabled.'
      }
    }

    this.beginVoicePanelAutoHideSuppression()
    try {
      let captureResult: NativeScreenshotCaptureResult
      const restorePanelAfterCapture = this.claimRegionCapturePanelRestore(payload)
      try {
        try {
          captureResult = await getNativeScreenshotService().capture({
            ...normalizeScreenshotTarget(payload),
            output: 'tfile',
            writeClipboard: false
          })
        } catch (error) {
          return {
            success: false,
            code: mapScreenshotUnavailableCode(error),
            error: error instanceof Error ? error.message : 'Native screenshot is unavailable.'
          }
        }
      } finally {
        if (restorePanelAfterCapture) this.clearRegionCapturePanelRestore(true)
      }

      if (typeof captureResult.path !== 'string' || !captureResult.path.trim()) {
        return {
          success: false,
          code: 'SCREENSHOT_UNAVAILABLE',
          error: 'Screenshot image is unavailable.'
        }
      }

      const ownerWindow = this.voicePanelWindow?.window.isDestroyed()
        ? undefined
        : this.voicePanelWindow?.window
      const saveOptions: SaveDialogOptions = {
        title: 'Save Screenshot',
        defaultPath: `tuff-screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      }
      const saveResult = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow, saveOptions)
        : await dialog.showSaveDialog(saveOptions)
      if (saveResult.canceled || !saveResult.filePath) {
        return {
          success: false,
          canceled: true
        }
      }

      await fs.copyFile(captureResult.path, saveResult.filePath)

      return {
        success: true,
        path: saveResult.filePath,
        mimeType: captureResult.mimeType,
        width: captureResult.width,
        height: captureResult.height,
        displayName: captureResult.displayName,
        sizeBytes: captureResult.sizeBytes
      }
    } catch (error) {
      return {
        success: false,
        code: 'SAVE_FAILED',
        error: error instanceof Error ? error.message : 'Screenshot save failed.'
      }
    } finally {
      this.releaseVoicePanelAutoHideSuppression()
    }
  }

  private async translateScreenshotWithOcrFallback(
    dataUrl: string,
    targetLang: string,
    degradedReason: AssistantScreenshotFallbackReason
  ): Promise<AssistantScreenshotTranslateResponse> {
    let ocrResult: IntelligenceInvokeResult<IntelligenceVisionOcrResult>
    try {
      ocrResult = await tuffIntelligence.vision.ocr(
        {
          source: { type: 'data-url', dataUrl },
          includeLayout: false,
          includeKeywords: false
        },
        {
          metadata: {
            caller: ASSISTANT_SCREENSHOT_TRANSLATE_CALLER,
            source: ASSISTANT_SCREENSHOT_FALLBACK_SOURCE
          }
        }
      )
    } catch (error) {
      return {
        success: false,
        ...toAssistantIntelligenceFailure(error, 'vision.ocr', {
          code: 'OCR_UNAVAILABLE',
          error: 'Screenshot OCR fallback is unavailable.'
        })
      }
    }

    const sourceText =
      typeof ocrResult.result?.text === 'string' ? ocrResult.result.text.trim() : ''
    if (!sourceText) {
      return {
        success: false,
        code: 'OCR_UNAVAILABLE',
        error: 'Screenshot OCR did not detect translatable text.'
      }
    }

    let translationResult: IntelligenceInvokeResult<string>
    try {
      const sourceLang =
        typeof ocrResult.result?.language === 'string' ? ocrResult.result.language.trim() : ''
      translationResult = await tuffIntelligence.text.translate(
        {
          text: sourceText,
          ...(sourceLang ? { sourceLang } : {}),
          targetLang
        },
        {
          metadata: {
            caller: ASSISTANT_SCREENSHOT_TRANSLATE_CALLER,
            source: ASSISTANT_SCREENSHOT_FALLBACK_SOURCE
          }
        }
      )
    } catch (error) {
      return {
        success: false,
        ...toAssistantIntelligenceFailure(error, 'text.translate', {
          code: 'TEXT_TRANSLATE_UNAVAILABLE',
          error: 'Screenshot text translation fallback is unavailable.'
        })
      }
    }

    const targetText =
      typeof translationResult.result === 'string' ? translationResult.result.trim() : ''
    if (!targetText) {
      return {
        success: false,
        code: 'TEXT_TRANSLATE_UNAVAILABLE',
        error: 'Screenshot text translation returned an empty result.'
      }
    }

    return {
      success: true,
      mode: 'ocr-text',
      sourceText,
      targetText,
      fallback: {
        degradedReason,
        ocr: {
          provider: ocrResult.provider,
          model: ocrResult.model,
          traceId: ocrResult.traceId,
          latencyMs: ocrResult.latency,
          engine: ocrResult.result.engine
        },
        translation: {
          provider: translationResult.provider,
          model: translationResult.model,
          traceId: translationResult.traceId,
          latencyMs: translationResult.latency
        }
      }
    }
  }

  private async handleScreenshotTranslate(
    payload?: AssistantScreenshotTranslatePayload
  ): Promise<AssistantScreenshotTranslateResponse> {
    const setting = this.readAppSetting()
    if (!this.isAssistantEnabled(setting) || !this.getFloatingBallSetting(setting).enabled) {
      return {
        success: false,
        code: 'ASSISTANT_DISABLED',
        error: 'Assistant floating ball is disabled.'
      }
    }

    this.beginVoicePanelAutoHideSuppression()
    try {
      let dataUrl: string | undefined
      const restorePanelAfterCapture = this.claimRegionCapturePanelRestore(payload)
      try {
        try {
          const captureResult = await getNativeScreenshotService().capture({
            ...normalizeScreenshotTarget(payload),
            output: 'data-url',
            writeClipboard: false
          })
          dataUrl = captureResult.dataUrl
        } catch (error) {
          return {
            success: false,
            code: mapScreenshotUnavailableCode(error),
            error: error instanceof Error ? error.message : 'Native screenshot is unavailable.'
          }
        }
      } finally {
        if (restorePanelAfterCapture) this.clearRegionCapturePanelRestore(true)
      }

      const screenshotDataUrl = typeof dataUrl === 'string' ? dataUrl.trim() : ''
      const imageBase64 = screenshotDataUrl ? normalizeImageBase64Payload(screenshotDataUrl) : null
      if (!imageBase64) {
        return {
          success: false,
          code: 'SCREENSHOT_UNAVAILABLE',
          error: 'Screenshot image is unavailable.'
        }
      }

      const targetLang = payload?.targetLang?.trim() || 'zh'
      const result = await translateImageBase64(imageBase64, targetLang, {
        openPinWindow: true
      })
      if (!result.success) {
        if (result.code === 'SCENE_UNAVAILABLE' || isIntelligenceErrorCode(result.code)) {
          const degradedReason: AssistantScreenshotFallbackReason = `IMAGE_TRANSLATE_${result.code}`
          return await this.translateScreenshotWithOcrFallback(
            screenshotDataUrl,
            targetLang,
            degradedReason
          )
        }
        return {
          success: false,
          code: 'IMAGE_UNAVAILABLE',
          error: result.error,
          reason: result.reason,
          recovery: result.recovery
        }
      }

      return {
        success: true,
        mode: 'translated-image',
        translatedImageBase64: result.translatedImageBase64,
        sourceText: result.sourceText,
        targetText: result.targetText,
        metadata: result.metadata
      }
    } finally {
      this.releaseVoicePanelAutoHideSuppression()
    }
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
