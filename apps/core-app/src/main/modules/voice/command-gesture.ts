import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { StorageList } from '@talex-touch/utils'
import type { AssistantVoiceCommandPayload } from '@talex-touch/utils/transport/events/assistant'
import { omniPanelModule, type OmniPanelGlobalKeyEvent } from '../omni-panel'
import { getMainConfig, subscribeMainConfig } from '../storage'

const COMMAND_HOLD_DELAY_MS = 320

type VoiceCommandGestureSink = (payload: AssistantVoiceCommandPayload) => void | Promise<void>

function isCommandGestureEnabled(setting: AppSetting): boolean {
  return (
    setting.assistant?.enabled === true &&
    setting.floatingBall?.enabled === true &&
    setting.voiceWake?.enabled === true
  )
}

/**
 * Maps the primary desktop modifier to two intentional gestures:
 * - tap Command/Ctrl: toggle persistent listening;
 * - hold Command/Ctrl: push-to-talk until release.
 *
 * The raw global hook is owned by OmniPanel so only one uiohook lifecycle is
 * active in the main process. This controller owns only the voice gesture state.
 */
export class CommandVoiceGestureController {
  private disposeGlobalKeyListener: (() => void) | null = null
  private disposeSettingsSubscription: (() => void) | null = null
  private holdTimer: NodeJS.Timeout | null = null
  private enabled = false
  private commandDown = false
  private holdStarted = false
  private toggleActive = false

  constructor(private readonly sink: VoiceCommandGestureSink) {}

  register(): void {
    if (this.disposeSettingsSubscription) return

    this.disposeSettingsSubscription = subscribeMainConfig(StorageList.APP_SETTING, (next) => {
      this.syncEnabled(next as AppSetting)
    })
    this.syncEnabled(getMainConfig(StorageList.APP_SETTING) as AppSetting)
  }

  unregister(): void {
    this.disposeSettingsSubscription?.()
    this.disposeSettingsSubscription = null
    this.enabled = false
    this.clearHoldTimer()

    if (this.holdStarted || this.toggleActive) {
      this.dispatch({
        action: 'stop',
        mode: this.holdStarted ? 'hold' : 'toggle',
        source: 'command'
      })
    }

    this.commandDown = false
    this.holdStarted = false
    this.toggleActive = false
    this.disposeGlobalKeyListener?.()
    this.disposeGlobalKeyListener = null
  }

  private syncEnabled(setting: AppSetting): void {
    const nextEnabled = isCommandGestureEnabled(setting)
    if (nextEnabled === this.enabled) return

    this.enabled = nextEnabled
    if (!nextEnabled) {
      this.clearHoldTimer()
      this.commandDown = false
      if (this.holdStarted || this.toggleActive) {
        this.dispatch({
          action: 'stop',
          mode: this.holdStarted ? 'hold' : 'toggle',
          source: 'command'
        })
      }
      this.holdStarted = false
      this.toggleActive = false
      this.disposeGlobalKeyListener?.()
      this.disposeGlobalKeyListener = null
      return
    }

    this.disposeGlobalKeyListener = omniPanelModule.registerGlobalKeyListener({
      onKeyDown: (event) => this.handleKeyDown(event),
      onKeyUp: (event) => this.handleKeyUp(event)
    })
  }

  private handleKeyDown(event: OmniPanelGlobalKeyEvent): void {
    if (!this.enabled || event.key !== 'primary-modifier' || this.commandDown) return

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
    }, COMMAND_HOLD_DELAY_MS)
  }

  private handleKeyUp(event: OmniPanelGlobalKeyEvent): void {
    if (!this.enabled || event.key !== 'primary-modifier' || !this.commandDown) return

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

    this.toggleActive = !this.toggleActive
    this.dispatch({
      action: this.toggleActive ? 'start' : 'stop',
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
