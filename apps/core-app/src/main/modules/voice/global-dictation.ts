import { Notification } from 'electron'
import { isVoiceCaptureUnavailableCode } from '@talex-touch/utils/transport/sdk/domains/voice'
import type { VoiceDictateResult } from '@talex-touch/utils/transport/sdk/domains/voice'
import { t } from '../../utils/i18n-helper'
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
  capture: () => Promise<{ text: string; issueCode?: string; issueMessage?: string }>
}> {
  const module = await import('../system/selection-capture')
  return module.selectionCaptureService
}

/**
 * Why the selection could not be read, by the reader's issue code. Its own message is a diagnostic
 * in English and goes to the log; an empty selection, or no code, gets the prompt to select text.
 */
const SELECTION_ISSUE_BODY_KEYS: Readonly<Record<string, string>> = Object.freeze({
  unsupported: 'notifications.voice.selectionUnsupportedBody',
  disabled: 'notifications.voice.selectionDisabledBody',
  failed: 'notifications.voice.selectionFailedBody'
})

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
 * delivery for the frontmost app. Both require explicit Beta opt-in in Advanced Settings and an
 * enabled shortcut — global microphone capture is invasive, and Quick Edit also reads the current
 * selection, so neither may arm itself.
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
      // A build without the audio component is not a permission problem, and telling the user to
      // go check their microphone sends them somewhere nothing is wrong. The code is what tells
      // the two apart; the notification is the only surface this gesture has.
      if (isVoiceCaptureUnavailableCode((error as { code?: unknown } | null)?.code)) {
        this.notify(
          t('notifications.voice.captureUnavailableTitle'),
          t('notifications.voice.captureUnavailableBody')
        )
      } else {
        this.notify(
          t('notifications.voice.gestureFailedTitle'),
          t('notifications.voice.gestureFailedBody')
        )
      }
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
        const issueBodyKey = capture.issueCode ? SELECTION_ISSUE_BODY_KEYS[capture.issueCode] : null
        this.notify(
          t('notifications.voice.quickEditNoSelectionTitle'),
          t(issueBodyKey ?? 'notifications.voice.quickEditNoSelectionBody')
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
      this.notify(
        `✍️ ${t('notifications.voice.quickEditListeningTitle')}`,
        t('notifications.voice.quickEditListeningBody', { count: selection.length })
      )
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
    this.notify(
      `🎙️ ${t('notifications.voice.dictationListeningTitle')}`,
      t('notifications.voice.dictationListeningBody')
    )
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
      this.notify(t('notifications.voice.noSpeechTitle'), t('notifications.voice.noSpeechBody'))
      return
    }
    if (result.delivery?.method === 'autopaste') return
    if (result.delivery?.method === 'clipboard') {
      this.notify(
        t('notifications.voice.dictationCopiedTitle'),
        t('notifications.voice.pasteManuallyBody')
      )
      return
    }

    if (result.delivery?.method === 'none') {
      // The reason is a code (`target-changed`, an auto-paste failure code, …), not something to
      // show; the two the user can act on are named, the rest ask for another try.
      const reason = result.delivery.reason
      this.notify(
        t('notifications.voice.dictationNotDeliveredTitle'),
        t(
          reason === 'target-unavailable'
            ? 'notifications.voice.targetUnavailableBody'
            : reason === 'target-changed' || !reason
              ? 'notifications.voice.targetChangedBody'
              : 'notifications.voice.dictationRetryBody'
        )
      )
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
      this.notify(
        t('notifications.voice.quickEditCancelledTitle'),
        t('notifications.voice.selectionUnchangedBody')
      )
      return
    }
    if (!result.text) {
      this.notify(
        t('notifications.voice.quickEditNotAppliedTitle'),
        t('notifications.voice.quickEditNotHeardBody')
      )
      return
    }
    if (result.delivery?.method === 'clipboard') {
      this.notify(
        t('notifications.voice.quickEditCopiedTitle'),
        t('notifications.voice.pasteManuallyBody')
      )
      return
    }
    if (result.delivery?.method !== 'none') return
    this.notify(
      t('notifications.voice.quickEditNotDeliveredTitle'),
      t(
        reason === 'target-changed'
          ? 'notifications.voice.quickEditTargetChangedBody'
          : 'notifications.voice.selectionUnchangedRetryBody'
      )
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
