import * as nativeAudio from '@talex-touch/tuff-native/audio'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { StorageList } from '@talex-touch/utils'
import type { AssistantVoiceCommandPayload } from '@talex-touch/utils/transport/events/assistant'
import { omniPanelModule } from '../omni-panel'
import { getMainConfig, subscribeMainConfig } from '../storage'
import { createLogger } from '../../utils/logger'

const VOICE_KEY_HOLD_DELAY_MS = 320
const voiceGestureLog = createLogger('VoiceGesture')
let platformRegistration = 0

type VoiceCommandGestureSink = (payload: AssistantVoiceCommandPayload) => void | Promise<void>
type VoiceSessionActiveReader = () => boolean
interface VoiceGestureKeyEvent {
  hasOtherKeys?: boolean
}

interface VoiceGestureKeyListener {
  onKeyDown?: (event: VoiceGestureKeyEvent) => void
  onKeyUp?: (event: VoiceGestureKeyEvent) => void
  onEscapeKeyDown?: () => void
  onEscapeKeyUp?: () => void
  onOtherKeyDown?: () => void
  onReset?: () => void
}

type VoiceGestureKeyRegistrar = (listener: VoiceGestureKeyListener) => () => void

const registerPrimaryModifierGesture: VoiceGestureKeyRegistrar = (listener) =>
  omniPanelModule.registerGlobalKeyListener({
    onKeyDown: (event) => {
      if (event.key === 'escape') {
        listener.onEscapeKeyDown?.()
        return
      }
      listener.onKeyDown?.({ hasOtherKeys: event.hasOtherKeys })
    },
    onKeyUp: (event) => {
      if (event.key === 'escape') {
        listener.onEscapeKeyUp?.()
        return
      }
      listener.onKeyUp?.({ hasOtherKeys: event.hasOtherKeys })
    },
    onOtherKeyDown: () => listener.onOtherKeyDown?.()
  })

export const registerPlatformVoiceGesture: VoiceGestureKeyRegistrar = (listener) => {
  if (process.platform !== 'darwin') return registerPrimaryModifierGesture(listener)
  const registration = ++platformRegistration
  let disposed = false

  try {
    const result = nativeAudio.startFunctionKeyMonitor((event) => {
      if (disposed || registration !== platformRegistration) return
      if (event.type === 'down') {
        listener.onKeyDown?.({ hasOtherKeys: event.hasOtherKeys })
      } else if (event.type === 'up') {
        listener.onKeyUp?.({})
      } else if (event.type === 'escape-down') {
        listener.onEscapeKeyDown?.()
      } else if (event.type === 'escape-up') {
        listener.onEscapeKeyUp?.()
      } else if (event.type === 'reset') {
        listener.onReset?.()
      } else {
        listener.onOtherKeyDown?.()
      }
    })
    if (!result.active) {
      voiceGestureLog.warn('macOS Fn voice gesture unavailable', {
        meta: { reason: result.reason ?? 'unknown' }
      })
      return () => {}
    }

    return () => {
      if (disposed || registration !== platformRegistration) return
      disposed = true
      nativeAudio.stopFunctionKeyMonitor()
    }
  } catch (error) {
    voiceGestureLog.warn('Failed to start macOS Fn voice gesture', { error })
    return () => {}
  }
}

/**
 * Captures Escape at the native HID tap while VoiceDock owns the active session.
 * The event is still projected to the main process for the typed cancel gesture;
 * only the foreground application's copy is suppressed.
 */
export function setPlatformVoiceEscapeCapture(enabled: boolean): void {
  if (process.platform !== 'darwin') return
  nativeAudio.setFunctionKeyMonitorEscapeCapture(enabled)
}

function isVoiceGestureEnabled(setting: AppSetting): boolean {
  return setting.voiceInput?.enabled === true
}

/**
 * Maps the platform voice key to two intentional gestures:
 * - macOS Fn tap / Windows-Linux Ctrl tap: toggle persistent listening;
 * - macOS Fn hold / Windows-Linux Ctrl hold: push-to-talk until release.
 *
 * OmniPanel continues to own the shared uiohook lifecycle on Windows/Linux.
 * macOS owns an active native event tap to suppress the standalone Fn/Globe action.
 */
export class CommandVoiceGestureController {
  private disposeGlobalKeyListener: (() => void) | null = null
  private disposeSettingsSubscription: (() => void) | null = null
  private holdTimer: NodeJS.Timeout | null = null
  private enabled = false
  private commandDown = false
  private holdStarted = false
  private escapeDown = false
  private registrationGeneration = 0

  constructor(
    private readonly sink: VoiceCommandGestureSink,
    private readonly isVoiceSessionActive: VoiceSessionActiveReader = () => false,
    private readonly registerKeyListener: VoiceGestureKeyRegistrar = registerPlatformVoiceGesture
  ) {}

  register(): void {
    if (this.disposeSettingsSubscription) return

    setPlatformVoiceEscapeCapture(false)
    this.disposeSettingsSubscription = subscribeMainConfig(StorageList.APP_SETTING, (next) => {
      this.syncEnabled(next as AppSetting)
    })
    this.syncEnabled(getMainConfig(StorageList.APP_SETTING) as AppSetting)
  }

  unregister(): void {
    this.registrationGeneration += 1
    this.disposeSettingsSubscription?.()
    this.disposeSettingsSubscription = null
    this.enabled = false
    this.clearHoldTimer()

    if (this.holdStarted || this.readVoiceSessionActive()) {
      this.dispatch({
        action: 'stop',
        mode: this.holdStarted ? 'hold' : 'toggle',
        source: 'command'
      })
    }

    this.resetEscapeGesture()
    this.commandDown = false
    this.holdStarted = false
    this.disposeGlobalKeyListener?.()
    this.disposeGlobalKeyListener = null
    setPlatformVoiceEscapeCapture(false)
  }

  private syncEnabled(setting: AppSetting): void {
    const nextEnabled = isVoiceGestureEnabled(setting)
    if (nextEnabled === this.enabled) return

    this.enabled = nextEnabled
    const generation = ++this.registrationGeneration
    if (!nextEnabled) {
      this.clearHoldTimer()
      this.resetEscapeGesture()
      this.commandDown = false
      if (this.holdStarted || this.readVoiceSessionActive()) {
        this.dispatch({
          action: 'stop',
          mode: this.holdStarted ? 'hold' : 'toggle',
          source: 'command'
        })
      }
      this.holdStarted = false
      this.disposeGlobalKeyListener?.()
      this.disposeGlobalKeyListener = null
      setPlatformVoiceEscapeCapture(false)
      return
    }

    const current = (): boolean => this.enabled && generation === this.registrationGeneration
    this.disposeGlobalKeyListener = this.registerKeyListener({
      onKeyDown: (event) => {
        if (current()) this.handleKeyDown(event)
      },
      onKeyUp: (event) => {
        if (current()) this.handleKeyUp(event)
      },
      onOtherKeyDown: () => {
        if (current()) this.handleOtherKeyDown()
      },
      onEscapeKeyDown: () => {
        if (current()) this.handleEscapeKeyDown()
      },
      onEscapeKeyUp: () => {
        if (current()) this.handleEscapeKeyUp()
      },
      onReset: () => {
        if (!current()) return
        this.cancelCombinedGesture()
        this.resetEscapeGesture()
      }
    })
  }
  private readVoiceSessionActive(): boolean {
    try {
      return this.isVoiceSessionActive()
    } catch {
      return false
    }
  }

  private handleKeyDown(event: VoiceGestureKeyEvent): void {
    if (!this.enabled) return
    if (event.hasOtherKeys) {
      this.cancelCombinedGesture()
      return
    }
    if (this.commandDown) return

    this.commandDown = true
    this.holdStarted = false
    this.clearHoldTimer()
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null
      if (!this.enabled || !this.commandDown || this.holdStarted) return

      this.holdStarted = true
      this.dispatch({
        action: 'start',
        mode: 'hold',
        source: 'command'
      })
    }, VOICE_KEY_HOLD_DELAY_MS)
  }

  private handleOtherKeyDown(): void {
    if (!this.enabled) return
    this.resetEscapeGesture()
    if (this.commandDown) this.cancelCombinedGesture()
  }

  private cancelCombinedGesture(): void {
    this.commandDown = false
    this.clearHoldTimer()
    if (!this.holdStarted) return

    this.holdStarted = false
    this.dispatch({
      action: 'stop',
      mode: 'hold',
      source: 'command'
    })
  }

  private handleEscapeKeyDown(): void {
    if (!this.enabled || this.escapeDown) return
    this.escapeDown = true
    this.dispatch({ action: 'cancel', state: 'start', source: 'command' })
  }

  private handleEscapeKeyUp(): void {
    this.resetEscapeGesture()
  }

  private resetEscapeGesture(): void {
    if (!this.escapeDown) return
    this.escapeDown = false
    this.dispatch({ action: 'cancel', state: 'reset', source: 'command' })
  }

  private handleKeyUp(event: VoiceGestureKeyEvent): void {
    if (!this.enabled || !this.commandDown) return
    if (event.hasOtherKeys) {
      this.cancelCombinedGesture()
      return
    }

    this.commandDown = false
    this.clearHoldTimer()
    if (this.holdStarted) {
      this.holdStarted = false
      this.dispatch({
        action: 'stop',
        mode: 'hold',
        source: 'command'
      })
      return
    }

    this.dispatch({
      action: 'toggle',
      mode: 'toggle',
      source: 'command'
    })
  }

  private clearHoldTimer(): void {
    if (!this.holdTimer) return
    clearTimeout(this.holdTimer)
    this.holdTimer = null
  }

  private dispatch(payload: AssistantVoiceCommandPayload): void {
    try {
      Promise.resolve(this.sink(payload)).catch(() => {
        // The owning Assistant module applies its own lifecycle/error policy.
      })
    } catch {
      // Keep global key handling fail-closed if the owner is tearing down.
    }
  }
}
