import type { StreamController } from '@talex-touch/utils/transport'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload,
  VoiceRecognitionStatus,
  VoiceSdk
} from '@talex-touch/utils/transport/sdk/domains/voice'
import type { ComputedRef, Ref } from 'vue'
import type { DictationNoticeKind } from './dictation-notice'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createVoiceSdk } from '@talex-touch/utils/transport/sdk/domains/voice'
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  readonly,
  ref,
  shallowRef
} from 'vue'
import { COMPOSER_MOTION } from './composer-motion'
import { classifyDictationFailure, notReadyNotice } from './dictation-notice'
import { mergeTranscript, spliceDictation, spokenSegment } from './dictation-text'
import { createLevelNormalizer } from './voice-level'

/**
 * `idle → starting → listening → finishing → idle`. Starting is the wait for the capture to open
 * (`ready` or a first level frame); finishing is the wait for the last final after a stop.
 */
export type DictationState = 'idle' | 'starting' | 'listening' | 'finishing'

/** How a session ended: words landed, nothing was heard, the user cancelled, or it failed. */
export type DictationOutcome = 'inserted' | 'empty' | 'cancelled' | 'failed'

/** The three Voice SDK methods the composer needs; injectable for tests. */
export type ComposerDictationSdk = Pick<
  VoiceSdk,
  'asrStream' | 'getRecognitionStatus' | 'openMicrophoneSettings'
>

export interface UseComposerDictationOptions {
  draft: Ref<string>
  input: () => HTMLTextAreaElement | null
  /** BCP-47 hint, read at start (`appSetting.voiceInput.language`). */
  language?: () => string | undefined
  /** After every draft write — the page's auto-grow. */
  onTextChange?: () => void
  onNotice?: (kind: DictationNoticeKind) => void
  sdk?: ComposerDictationSdk
}

export interface UseComposerDictationReturn {
  state: Readonly<Ref<DictationState>>
  /** Normalized level history for the waveform, oldest first. */
  levels: Readonly<Ref<readonly number[]>>
  /** Time since the capture opened, in whole seconds (ms). */
  elapsedMs: Readonly<Ref<number>>
  /** How the last session ended; `null` while one runs or before the first. */
  outcome: Readonly<Ref<DictationOutcome | null>>
  /** A session is starting, listening or finishing: the field is read-only meanwhile. */
  active: ComputedRef<boolean>
  /** The microphone key: start when idle, stop while starting or listening. */
  toggle: () => void
  start: () => Promise<void>
  /**
   * Stops capture and lets the session finish — its last final still lands. Resolves with how it
   * ended (`null` when nothing was running); 「结束并发送」 sends on `inserted`.
   */
  stop: () => Promise<DictationOutcome | null>
  /** Aborts the session; `restore` (default) puts the draft back as it was before it started. */
  cancel: (options?: { restore?: boolean }) => void
  refreshReadiness: () => Promise<void>
  openMicrophoneSettings: () => Promise<void>
}

interface Session {
  generation: number
  controller: StreamController | null
  stopRequested: boolean
  stopSent: boolean
  /** The draft and its selection when the session started; restored on cancel or empty. */
  snapshot: { draft: string; start: number; end: number }
  before: string
  after: string
  committed: string
  partial: string
  /** Whether anything has been written into the draft yet. */
  wrote: boolean
  /** `ready` or a level frame arrived: the microphone answers. */
  captured: boolean
  normalize: (rms: number) => number
  waiters: Array<(outcome: DictationOutcome) => void>
}

/**
 * The composer's dictation (task `09-26-composer-controls-redesign`, D10; research `dictation.md`
 * §4): one `asrStream` session at a time whose words land in the draft at the caret.
 *
 * `delivery: 'none'` keeps the text in this window (main types nothing anywhere), `deliveryTiming:
 * 'live'` skips main's AI tidy-up so a stop is never followed by a rewrite, and `cleanup` keeps the
 * provider's disfluency removal. Not gated by the Voice Input switch (D10-a): that switch governs
 * the platform gestures and the HUD, and pressing this button is the consent.
 *
 * Session rules from the voice contract: every session has a generation and a late callback from an
 * older one is dropped; a stop asked for before the stream handle arrives is applied as `stop()`
 * when it does, never turned into `cancel()`; neither `ready` nor a level frame within 2s means the
 * microphone is not answering, and the session is cancelled with a notice.
 */
export function useComposerDictation(
  options: UseComposerDictationOptions
): UseComposerDictationReturn {
  const sdk = options.sdk ?? createVoiceSdk(useTuffTransport())
  const { mic } = COMPOSER_MOTION

  const state = ref<DictationState>('idle')
  const levels = shallowRef<readonly number[]>(new Array<number>(mic.levelHistory).fill(0))
  const elapsedMs = ref(0)
  const outcome = ref<DictationOutcome | null>(null)
  const active = computed(() => state.value !== 'idle')

  let session: Session | null = null
  let nextGeneration = 0
  let readiness: VoiceRecognitionStatus | null = null
  let watchdog: ReturnType<typeof setTimeout> | null = null
  let clock: ReturnType<typeof setInterval> | null = null

  function clearWatchdog(): void {
    if (watchdog !== null) clearTimeout(watchdog)
    watchdog = null
  }

  function startClock(): void {
    if (clock !== null) return
    clock = setInterval(() => {
      elapsedMs.value += 1000
    }, 1000)
  }

  function stopClock(): void {
    if (clock !== null) clearInterval(clock)
    clock = null
  }

  function focusedInput(): HTMLTextAreaElement | null {
    const input = options.input()
    return input && hasDocument() && document.activeElement === input ? input : null
  }

  /** Writes before + spoken + after into the draft and keeps the caret at the insertion's end. */
  function write(current: Session): number | null {
    const spoken = mergeTranscript(current.committed, current.partial)
    if (!spoken.trim()) return null
    const { text, caret } = spliceDictation({
      before: current.before,
      after: current.after,
      spoken
    })
    current.wrote = true
    if (options.draft.value !== text) options.draft.value = text
    void nextTick(() => {
      options.onTextChange?.()
      focusedInput()?.setSelectionRange(caret, caret)
    })
    return caret
  }

  function restoreSnapshot(current: Session): void {
    if (!current.wrote) return
    const { draft, start, end } = current.snapshot
    options.draft.value = draft
    void nextTick(() => {
      options.onTextChange?.()
      focusedInput()?.setSelectionRange(start, end)
    })
  }

  /** Retires the session: every later callback of this generation finds `session !== current`. */
  function finish(current: Session, result: DictationOutcome): void {
    if (session !== current) return
    session = null
    clearWatchdog()
    stopClock()
    state.value = 'idle'
    outcome.value = result
    for (const resolve of current.waiters.splice(0)) resolve(result)
  }

  function sendStop(current: Session): void {
    if (current.stopSent || !current.controller) return
    current.stopSent = true
    // A transport without `stop` runs to its natural end (silence auto-stop); never cancel instead.
    current.controller.stop?.()
  }

  function markCaptured(current: Session): void {
    if (current.captured) return
    current.captured = true
    clearWatchdog()
    if (state.value === 'starting') {
      state.value = 'listening'
      startClock()
    }
  }

  function handleEvent(current: Session, event: VoiceAsrStreamEvent): void {
    if (session !== current) return
    switch (event.type) {
      case 'ready':
        markCaptured(current)
        return
      case 'level': {
        markCaptured(current)
        const next = [...levels.value.slice(1), current.normalize(event.rms)]
        levels.value = next
        return
      }
      // A segment made out of silence (`。。。`, a subtitle credit) never reaches the draft, not
      // even for the moment a partial stays up; a session of nothing else ends as `empty`.
      // Each partial is the provider's whole hypothesis for the utterance so far — main keeps it
      // the same way (`lastPartialText`) — so it replaces the last one. Merged instead, a revised
      // hypothesis (a word corrected, a trailing 。 turned into ，) read as new words and was
      // appended, and a session that ended without a final left every revision in the draft.
      case 'partial':
        current.partial = spokenSegment(event.text)
        write(current)
        return
      case 'final':
        current.committed = mergeTranscript(
          current.committed,
          spokenSegment(event.text) || current.partial
        )
        current.partial = ''
        write(current)
        return
      case 'end':
        handleEnd(current)
        return
      default:
        // `device` is informational: the same capture keeps running.
        return
    }
  }

  function handleEnd(current: Session): void {
    if (session !== current) return
    // A partial the provider never finalized was on screen; it stays.
    current.committed = mergeTranscript(current.committed, current.partial)
    current.partial = ''
    const caret = write(current)
    if (caret === null) {
      restoreSnapshot(current)
      finish(current, 'empty')
      options.onNotice?.('empty')
      return
    }
    finish(current, 'inserted')
    // Focus goes back to the field when it was still in the composer (the mic key, the field
    // itself); a user who has moved on elsewhere keeps their focus.
    void nextTick(() => {
      const input = options.input()
      if (!input || !hasDocument()) return
      const focused = document.activeElement
      const inComposer =
        !focused || focused === document.body || input.parentElement?.contains(focused)
      if (!inComposer) return
      input.focus()
      input.setSelectionRange(caret, caret)
    })
  }

  function handleError(current: Session, error: unknown): void {
    if (session !== current) return
    // What the user has already seen stays in the draft; only the notice is new.
    finish(current, 'failed')
    const kind = classifyDictationFailure(error)
    if (kind) options.onNotice?.(kind)
  }

  async function start(): Promise<void> {
    if (session) return
    if (readiness && !readiness.ready) {
      options.onNotice?.(notReadyNotice(readiness.reason))
      return
    }

    const draft = options.draft.value
    const input = options.input()
    const selectionStart = Math.min(
      Math.max(input?.selectionStart ?? draft.length, 0),
      draft.length
    )
    const selectionEnd = Math.min(
      Math.max(input?.selectionEnd ?? selectionStart, selectionStart),
      draft.length
    )
    const current: Session = {
      generation: ++nextGeneration,
      controller: null,
      stopRequested: false,
      stopSent: false,
      snapshot: { draft, start: selectionStart, end: selectionEnd },
      before: draft.slice(0, selectionStart),
      after: draft.slice(selectionEnd),
      committed: '',
      partial: '',
      wrote: false,
      captured: false,
      normalize: createLevelNormalizer(),
      waiters: []
    }
    session = current
    outcome.value = null
    levels.value = new Array<number>(mic.levelHistory).fill(0)
    elapsedMs.value = 0
    state.value = 'starting'

    clearWatchdog()
    watchdog = setTimeout(() => {
      watchdog = null
      if (session !== current || current.captured) return
      // Not slow — not answering. Breathing forever would be its own kind of lie.
      cancel({ restore: true })
      options.onNotice?.('microphone-unresponsive')
    }, mic.captureWatchdogMs)

    const payload: VoiceAsrStreamPayload = {
      delivery: 'none',
      deliveryTiming: 'live',
      cleanup: true,
      emitLevel: true,
      ...(options.language?.() ? { language: options.language() } : {})
    }

    try {
      const controller = await sdk.asrStream(payload, {
        onData: (event) => handleEvent(current, event),
        onError: (error) => handleError(current, error),
        onEnd: () => handleEnd(current)
      })
      if (session !== current) {
        // Cancelled, or already over, while the handle was on its way.
        controller.cancel()
        return
      }
      current.controller = controller
      if (current.stopRequested) sendStop(current)
    } catch (error) {
      handleError(current, error)
    }
  }

  function stop(): Promise<DictationOutcome | null> {
    const current = session
    if (!current) return Promise.resolve(null)
    const settled = new Promise<DictationOutcome>((resolve) => current.waiters.push(resolve))
    if (!current.stopRequested) {
      current.stopRequested = true
      state.value = 'finishing'
      stopClock()
      // The handle may not be here yet: the stop is remembered and applied when it arrives.
      sendStop(current)
    }
    return settled
  }

  function cancel({ restore = true }: { restore?: boolean } = {}): void {
    const current = session
    if (!current) return
    finish(current, 'cancelled')
    current.controller?.cancel()
    if (restore) restoreSnapshot(current)
  }

  function toggle(): void {
    if (state.value === 'idle') void start()
    else if (state.value === 'starting' || state.value === 'listening') void stop()
  }

  async function refreshReadiness(): Promise<void> {
    try {
      readiness = (await sdk.getRecognitionStatus()).asr
    } catch {
      // Could not ask is not "not ready": the press still tries, and a failure is classified.
      readiness = null
    }
  }

  async function openMicrophoneSettings(): Promise<void> {
    try {
      await sdk.openMicrophoneSettings()
    } catch {
      // The platform has no such pane; the notice already said what is wrong.
    }
  }

  if (getCurrentInstance()) {
    const onFocus = (): void => void refreshReadiness()
    onMounted(() => {
      void refreshReadiness()
      if (hasWindow()) window.addEventListener('focus', onFocus)
    })
    onBeforeUnmount(() => {
      if (hasWindow()) window.removeEventListener('focus', onFocus)
    })
  }
  // Unmounting abandons the session without writing the draft back.
  onScopeDispose(() => cancel({ restore: false }))

  return {
    state: readonly(state),
    levels: readonly(levels),
    elapsedMs: readonly(elapsedMs),
    outcome: readonly(outcome),
    active,
    toggle,
    start,
    stop,
    cancel,
    refreshReadiness,
    openMicrophoneSettings
  }
}
