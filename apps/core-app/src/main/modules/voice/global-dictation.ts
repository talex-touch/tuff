import { Notification } from 'electron'
import type { VoiceDictateResult } from '@talex-touch/utils/transport/sdk/domains/voice'
import { createLogger } from '../../utils/logger'
import { shortcutModule } from '../global-shortcon'
import { voiceService } from './voice-service'

const log = createLogger('VoiceGlobal')

/**
 * The selection reader is loaded on demand.
 *
 * A static import would pull the transport SDK's main entry into this module's graph, and every
 * suite that mocks Electron without `ipcMain` then fails at collection — the same collection
 * failure `voice-service` avoids by importing analytics and the temp-file service the same way.
 * Only one of the two gestures needs it, and only once per press.
 */
async function loadSelectionCapture(): Promise<{
  capture: () => Promise<{ text: string; issueMessage?: string }>
}> {
  const module = await import('../system/selection-capture')
  return module.selectionCaptureService
}

const DICTATION_SHORTCUT_ID = 'voice.dictation.toggle'
const QUICK_EDIT_SHORTCUT_ID = 'voice.quickEdit'
const DICTATION_ACCELERATOR = 'CommandOrControl+Shift+U'
const QUICK_EDIT_ACCELERATOR = 'CommandOrControl+Shift+E'
const OWNER = 'voice'

/**
 * The two gestures this controller owns.
 *
 * One session at a time is the whole reason they share a controller: both are "press, speak, press
 * again", both deliver to the application that was frontmost when they started, and two independent
 * controllers could be listening through one microphone with neither of them knowing.
 */
type VoiceGesture = 'dictation' | 'quickEdit'

/**
 * Global voice gestures: system-wide shortcuts that drive the canonical Voice Session.
 *
 * The session owner performs transcription, polish or rewrite, target validation and main-owned
 * delivery for the frontmost app. Both shortcuts stay disabled until the user enables them in the
 * shortcut settings — a global microphone shortcut is invasive, and Quick Edit also reads the
 * current selection, so neither of them may arm itself.
 */
export class GlobalDictationController {
  private activeSessionId: string | null = null
  private activeGesture: VoiceGesture | null = null
  private busy = false
  /**
   * A press that arrived while a start was in flight.
   *
   * Starting a gesture is not instant — it opens the microphone and, for an edit, reads the
   * selection first. A second tap inside that window used to be dropped, which left the session
   * listening until the user pressed a third time. The intent is remembered instead, and acted on
   * the moment the start settles.
   */
  private pendingStop = false
  private readonly registered = new Set<string>()
  /**
   * A start can resolve after unregister. The canonical session id is retained
   * by the controller once available so teardown can cancel it deterministically.
   */
  private disposed = false

  register(): void {
    if (this.registered.size > 0) return
    this.disposed = false
    this.registerGesture(DICTATION_SHORTCUT_ID, DICTATION_ACCELERATOR, 'dictation')
    this.registerGesture(QUICK_EDIT_SHORTCUT_ID, QUICK_EDIT_ACCELERATOR, 'quickEdit')
  }

  private registerGesture(id: string, accelerator: string, gesture: VoiceGesture): void {
    try {
      const ok = shortcutModule.registerMainShortcut(
        id,
        accelerator,
        () => {
          void this.toggle(gesture)
        },
        { owner: OWNER, enabled: false }
      )
      if (!ok) return
      this.registered.add(id)
      log.success(`${id} registered (${accelerator}), off until the user enables it`)
    } catch (error) {
      log.warn(`Failed to register ${id}`, { error })
    }
  }

  unregister(): void {
    this.disposed = true
    for (const id of [...this.registered]) {
      try {
        shortcutModule.unregisterMainShortcut(id)
      } catch (error) {
        log.warn(`Failed to unregister ${id}`, { error })
      }
      this.registered.delete(id)
    }
    if (this.activeSessionId) {
      voiceService.cancelSession(this.activeSessionId)
      this.activeSessionId = null
    }
    this.activeGesture = null
    this.pendingStop = false
  }

  private async toggle(gesture: VoiceGesture): Promise<void> {
    if (this.busy) {
      this.pendingStop = true
      return
    }
    this.busy = true
    try {
      if (this.activeSessionId) {
        await this.finish()
      } else {
        await this.start(gesture)
      }
    } catch (error) {
      log.error('Global voice gesture failed', { meta: { gesture }, error })
      if (this.activeSessionId) voiceService.cancelSession(this.activeSessionId)
      this.activeSessionId = null
      this.activeGesture = null
      this.notify('语音手势失败', '请检查麦克风权限与语音服务配置')
    } finally {
      this.busy = false
      if (this.pendingStop) {
        this.pendingStop = false
        void this.toggle(gesture)
      }
    }
  }

  private async start(gesture: VoiceGesture): Promise<void> {
    if (gesture === 'quickEdit') {
      /*
       * Quick Edit reads the passage before it starts listening, and refuses when there is none.
       *
       * That read is also what the delivery stands on: the replacement is typed over a selection
       * that is still live in the target application, so a session that started without one would
       * have nothing to replace and would insert the instruction as new text instead.
       */
      const { capture: captureSelection } = await loadSelectionCapture()
      const capture = await captureSelection()
      const selection = capture.text.trim()
      if (!selection) {
        // The user sees a notification, but a refusal leaves no trace in the log otherwise, and a
        // "the shortcut does nothing" report is unanswerable without it.
        log.info(
          `Quick edit found no usable selection${capture.issueMessage ? ` (${capture.issueMessage})` : ''}`
        )
        this.notify(
          '划词改口：先选中一段文字',
          capture.issueMessage || '在任意应用里选中文字，再按一次快捷键'
        )
        return
      }
      const sessionId = await voiceService.startSession({
        maxDurationMs: 120_000,
        silenceStopMs: 3_600_000,
        delivery: 'active-app',
        editTarget: { selection }
      })
      if (this.disposed) {
        voiceService.cancelSession(sessionId)
        return
      }
      this.activeSessionId = sessionId
      this.activeGesture = gesture
      log.success(`Quick edit listening over ${selection.length} selected characters`)
      this.notify('✍️ 正在改口…', `选中 ${selection.length} 字，说完再按一次快捷键`)
      return
    }

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
    this.activeGesture = gesture
    log.success('Dictation listening')
    this.notify('🎙️ 正在听写…', '再次按下快捷键停止并键入')
  }

  private async finish(): Promise<void> {
    const sessionId = this.activeSessionId
    const gesture = this.activeGesture
    this.activeSessionId = null
    this.activeGesture = null
    if (!sessionId) return
    const result = await voiceService.stopSession(sessionId, { cleanup: true })
    log.success(
      `${gesture === 'quickEdit' ? 'Quick edit' : 'Dictation'} finished (delivery: ${result.delivery?.method ?? 'none'})`
    )
    if (gesture === 'quickEdit') {
      this.reportQuickEdit(result)
      return
    }
    if (!result.text) {
      this.notify('没有识别到语音', '请靠近麦克风再试一次')
      return
    }
    if (result.delivery?.method === 'autopaste') return
    if (result.delivery?.method === 'none') {
      this.notify('听写未写入', result.delivery.reason || '当前应用目标已变化，请重试')
    }
  }

  /**
   * Say what happened to the passage, because this gesture's failure mode is silence.
   *
   * A dictation that fails leaves nothing behind, which the user can see. An edit that fails leaves
   * the selection exactly as it was — indistinguishable from an edit that never ran — so every
   * outcome that is not a delivered replacement names itself, and says the passage is untouched.
   */
  private reportQuickEdit(result: VoiceDictateResult): void {
    const reason = result.delivery?.reason
    if (reason === 'quick-edit-cancelled') {
      this.notify('已取消改口', '选中文字保持原样')
      return
    }
    if (!result.text) {
      this.notify('改口未应用', '没听清改写要求，选中文字保持原样')
      return
    }
    if (result.delivery?.method !== 'none') return
    this.notify(
      '改口未写入',
      reason === 'target-changed' ? '当前应用已切换，选中文字保持原样' : reason || '请重试'
    )
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
