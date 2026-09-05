import { Notification } from 'electron'
import { createLogger } from '../../utils/logger'
import { shortcutModule } from '../global-shortcon'
import { voiceService } from './voice-service'

const log = createLogger('VoiceGlobal')

const SHORTCUT_ID = 'voice.dictation.toggle'
const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+U'
const OWNER = 'voice'

/**
 * Global toggle dictation: a system-wide shortcut that starts and stops the
 * canonical Voice Session. The session owner performs transcription, polish,
 * target validation and main-owned delivery for the frontmost app.
 *
 * The shortcut remains disabled by default because a global microphone shortcut
 * is invasive; users opt in through the standard shortcut settings.
 */
export class GlobalDictationController {
  private activeSessionId: string | null = null
  private busy = false
  private registered = false
  /**
   * A start can resolve after unregister. The canonical session id is retained
   * by the controller once available so teardown can cancel it deterministically.
   */
  private disposed = false

  register(): void {
    if (this.registered) return
    this.disposed = false
    try {
      const ok = shortcutModule.registerMainShortcut(
        SHORTCUT_ID,
        DEFAULT_ACCELERATOR,
        () => {
          void this.toggle()
        },
        { owner: OWNER, enabled: false }
      )
      this.registered = ok
      if (ok) {
        log.success(`Global dictation toggle registered (${DEFAULT_ACCELERATOR})`)
      }
    } catch (error) {
      log.warn('Failed to register global dictation toggle', { error })
    }
  }

  unregister(): void {
    this.disposed = true
    if (this.registered) {
      try {
        shortcutModule.unregisterMainShortcut(SHORTCUT_ID)
      } catch (error) {
        log.warn('Failed to unregister global dictation toggle', { error })
      }
      this.registered = false
    }
    if (this.activeSessionId) {
      voiceService.cancelSession(this.activeSessionId)
      this.activeSessionId = null
    }
  }

  private async toggle(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      if (this.activeSessionId) {
        await this.finish(this.activeSessionId)
      } else {
        const sessionId = await voiceService.startSession({
          maxDurationMs: 120_000,
          silenceStopMs: 3_600_000,
          delivery: 'active-app'
        })
        if (this.disposed) {
          voiceService.cancelSession(sessionId)
          return
        }
        this.activeSessionId = sessionId
        this.notify('🎙️ 正在听写…', '再次按下快捷键停止并键入')
      }
    } catch (error) {
      log.error('Global dictation toggle failed', { error })
      if (this.activeSessionId) voiceService.cancelSession(this.activeSessionId)
      this.activeSessionId = null
      this.notify('听写失败', '请检查麦克风权限与语音服务配置')
    } finally {
      this.busy = false
    }
  }

  private async finish(sessionId: string): Promise<void> {
    this.activeSessionId = null
    const result = await voiceService.stopSession(sessionId, { cleanup: true })
    if (!result.text) {
      this.notify('没有识别到语音', '请靠近麦克风再试一次')
      return
    }
    if (result.delivery?.method === 'autopaste') return
    if (result.delivery?.method === 'none') {
      this.notify('听写未写入', result.delivery.reason || '当前应用目标已变化，请重试')
    }
  }

  private notify(title: string, body: string): void {
    try {
      if (Notification.isSupported()) {
        new Notification({ title, body, silent: true }).show()
      }
    } catch {
      /* best effort */
    }
  }
}

export const globalDictationController = new GlobalDictationController()
