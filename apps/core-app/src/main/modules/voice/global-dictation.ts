import { Notification } from 'electron'
import { createLogger } from '../../utils/logger'
import { shortcutModule } from '../global-shortcon'
import { voiceService } from './voice-service'

const log = createLogger('VoiceGlobal')

const SHORTCUT_ID = 'voice.dictation.toggle'
const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+U'
const OWNER = 'voice'

/**
 * Global toggle dictation: a system-wide shortcut that starts capture on the
 * first press and, on the second press, transcribes → polishes → injects the
 * text into the frontmost app (native enigo keystrokes, clipboard fallback).
 *
 * The shortcut is registered DISABLED by default (a global mic+keystroke shortcut
 * is invasive) — the user opts in / rebinds it via the standard shortcut settings.
 */
export class GlobalDictationController {
  private activeSessionId: string | null = null
  private busy = false
  private registered = false

  register(): void {
    if (this.registered) return
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
    if (this.registered) {
      try {
        shortcutModule.unregisterMainShortcut(SHORTCUT_ID)
      } catch (error) {
        log.warn('Failed to unregister global dictation toggle', { error })
      }
      this.registered = false
    }
    if (this.activeSessionId) {
      voiceService.abortCapture(this.activeSessionId)
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
        this.activeSessionId = voiceService.beginCapture()
        this.notify('🎙️ 正在听写…', '再次按下快捷键停止并键入')
      }
    } catch (error) {
      log.error('Global dictation toggle failed', { error })
      if (this.activeSessionId) {
        voiceService.abortCapture(this.activeSessionId)
      }
      this.activeSessionId = null
      this.notify('听写失败', '请检查麦克风权限与语音服务配置')
    } finally {
      this.busy = false
    }
  }

  private async finish(sessionId: string): Promise<void> {
    this.activeSessionId = null
    const result = await voiceService.endCapture(sessionId, { cleanup: true })
    if (!result.text) {
      this.notify('没有识别到语音', '请靠近麦克风再试一次')
      return
    }
    const delivery = voiceService.injectText(result.text)
    if (delivery.method === 'clipboard') {
      this.notify(
        '已复制到剪贴板',
        delivery.reason === 'accessibility-required'
          ? '开启辅助功能权限即可自动键入；已复制，可 Cmd/Ctrl+V 粘贴'
          : '已复制，可 Cmd/Ctrl+V 粘贴'
      )
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
