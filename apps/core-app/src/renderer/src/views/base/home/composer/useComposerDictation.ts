import type { StreamController } from '@talex-touch/utils/transport'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload,
  VoiceCaptureStatus,
  VoiceKeptRecording,
  VoiceRecognitionStatus,
  VoiceSdk
} from '@talex-touch/utils/transport/sdk/domains/voice'
import type { ComputedRef, Ref } from 'vue'
import type { DictationFailureNotice, DictationNoticeKind } from './dictation-notice'
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
import { captureNoticeKind, classifyDictationFailure, notReadyNotice } from './dictation-notice'
import { mergeTranscript, spliceDictation, spokenSegment } from './dictation-text'
import { createLevelNormalizer } from './voice-level'

/**
 * `idle → starting → listening → finishing → idle`. Starting is the wait for the capture to open
 * (`ready` or a first level frame); finishing is the wait for the last final after a stop.
 */
export type DictationState = 'idle' | 'starting' | 'listening' | 'finishing'

/** How a session ended: words landed, nothing was heard, the user cancelled, or it failed. */
export type DictationOutcome = 'inserted' | 'empty' | 'cancelled' | 'failed'

/** The Voice SDK methods the composer needs; injectable for tests. */
export type ComposerDictationSdk = Pick<
  VoiceSdk,
  | 'asrStream'
  | 'getRecognitionStatus'
  | 'openMicrophoneSettings'
  | 'transcribeRecording'
  | 'discardRecording'
>

/** What a voice clip's words are doing: in the draft, none heard, or recognition failed. */
export type DictationClipOutcome = 'inserted' | 'empty' | 'failed'

/**
 * The audio of the last finished session, kept by main (`keepRecording`) for the Home voice clip:
 * played back, recognized again, or sent as a voice message. One at a time — the next session, a
 * send, or dismissing it lets it go.
 */
export interface DictationClip {
  recording: VoiceKeptRecording
  outcome: DictationClipOutcome
  /** Why recognition failed (`outcome === 'failed'`), or why the last attempt on the clip did. */
  failure: DictationFailureNotice | null
  /**
   * The words the clip put in the draft and the draft on either side of them, so a send can take
   * them back out and another recognition can replace them — as long as nobody has edited the
   * draft since. `spoken` is empty when nothing landed.
   */
  spoken: string
  before: string
  after: string
  /** The draft as the clip left it; another edit since means the clip no longer owns any of it. */
  draft: string
  /** The draft to go back to when the clip's words are taken out (before the session, usually). */
  original: string
  /** The session's levels, oldest first, bucketed for the clip's waveform. */
  peaks: readonly number[]
  /** A recognition or a send in flight on the clip. */
  busy: 'recognizing' | 'sending' | null
}

/** Bars in a clip's waveform: the whole session's levels, bucketed to this many. */
const CLIP_PEAK_COUNT = 48

export interface UseComposerDictationOptions {
  draft: Ref<string>
  input: () => HTMLTextAreaElement | null
  /** BCP-47 hint, read at start (`appSetting.voiceInput.language`). */
  language?: () => string | undefined
  /** After every draft write — the page's auto-grow. */
  onTextChange?: () => void
  /** What to tell the user: the notice kind, and the failure's own sentence when it had one. */
  onNotice?: (kind: DictationNoticeKind, detail?: string) => void
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
  /**
   * This build has no audio component, so the microphone entry is withheld rather than offered.
   * False whenever the status could not be read — an unanswerable question is not a verdict.
   */
  captureBlocked: Readonly<Ref<boolean>>
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
  /** The finished session's voice clip, `null` when there is none (see {@link DictationClip}). */
  clip: Readonly<Ref<DictationClip | null>>
  /**
   * Recognizes the clip again and puts the words in the draft — in place of the clip's earlier
   * words while they are still there untouched, else where its words would have gone. Resolves
   * with the clip's new outcome; a failure stays on the clip rather than throwing.
   */
  recognizeClip: () => Promise<DictationClipOutcome | null>
  /** The clip's words for a send: its own when it has them, else recognized now (throws). */
  clipTranscript: () => Promise<string>
  /** The draft without the clip's words, when they are still there as they landed. */
  draftWithoutClip: () => string
  /**
   * Marks the clip as sending, or done sending; a failure given with it replaces the clip's own
   * (`null` clears it, absent leaves it as it was).
   */
  markClipSending: (sending: boolean, failure?: DictationFailureNotice | null) => void
  /** Hands the clip to a send: off the screen, its audio left for main to take. */
  takeClip: () => DictationClip | null
  /** Puts back a clip whose send failed, unless a newer clip has taken its place. */
  restoreClip: (clip: DictationClip) => void
  /** Dismisses the clip and lets main delete its audio. */
  dismissClip: () => void
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
  /** Every normalized level of the session, for the clip's waveform. */
  allLevels: number[]
  /** Main kept the session's audio (`recording` event). */
  recording: VoiceKeptRecording | null
  waiters: Array<(outcome: DictationOutcome) => void>
}

/** A level history bucketed to `count` peaks: each bar is the loudest frame in its span. */
export function bucketPeaks(levels: readonly number[], count = CLIP_PEAK_COUNT): number[] {
  if (levels.length === 0) return []
  if (levels.length <= count) return levels.map((level) => Math.min(1, Math.max(0, level)))
  const peaks: number[] = []
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * levels.length) / count)
    const end = Math.max(start + 1, Math.floor(((index + 1) * levels.length) / count))
    let peak = 0
    for (let at = start; at < end; at += 1) peak = Math.max(peak, levels[at] ?? 0)
    peaks.push(Math.min(1, Math.max(0, peak)))
  }
  return peaks
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

  const captureBlocked = ref(false)
  const state = ref<DictationState>('idle')
  const levels = shallowRef<readonly number[]>(new Array<number>(mic.levelHistory).fill(0))
  const elapsedMs = ref(0)
  const outcome = ref<DictationOutcome | null>(null)
  const active = computed(() => state.value !== 'idle')
  const clip = shallowRef<DictationClip | null>(null)

  let session: Session | null = null
  let nextGeneration = 0
  let readiness: VoiceRecognitionStatus | null = null
  /**
   * Whether this build can capture at all, as of the last status read. Separate from `readiness`,
   * which is about the recogniser: a build can have both and still fail, which is exactly what a
   * package without its audio addon looks like from here.
   */
  let capture: VoiceCaptureStatus | undefined
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
        const level = current.normalize(event.rms)
        current.allLevels.push(level)
        levels.value = [...levels.value.slice(1), level]
        return
      }
      // Main kept the session's audio; it becomes the clip once the session has ended.
      case 'recording':
        current.recording = event.recording
        return
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
      // A clip says it itself, with the recording to try again on.
      if (!offerClip(current, 'empty', null)) options.onNotice?.('empty')
      return
    }
    finish(current, 'inserted')
    offerClip(current, 'inserted', null)
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
    const notice = classifyDictationFailure(error)
    // With the audio kept, the clip carries the failure and the way past it (recognize again, or
    // send the voice); without it — a microphone that never opened — the toast does.
    if (notice && offerClip(current, 'failed', notice)) return
    if (notice) options.onNotice?.(notice.kind, notice.detail)
  }

  function discardRecording(recordingId: string): void {
    // Main also lets an unclaimed clip go on its own; a failed discard leaves nothing to show.
    void sdk.discardRecording({ recordingId }).catch(() => undefined)
  }

  /** One clip at a time: the one it replaces lets its audio go. */
  function replaceClip(next: DictationClip | null): void {
    const previous = clip.value
    clip.value = next
    if (previous && previous.recording.id !== next?.recording.id)
      discardRecording(previous.recording.id)
  }

  /** Shows the session's clip when main kept its audio; false when it did not. */
  function offerClip(
    current: Session,
    result: DictationClipOutcome,
    failure: DictationFailureNotice | null
  ): boolean {
    const recording = current.recording
    if (!recording) return false
    const spoken = result === 'empty' ? '' : mergeTranscript(current.committed, current.partial)
    replaceClip({
      recording,
      outcome: result,
      failure,
      spoken: current.wrote ? spoken.trim() : '',
      before: current.before,
      after: current.after,
      draft: options.draft.value,
      original: current.snapshot.draft,
      peaks: bucketPeaks(current.allLevels),
      busy: null
    })
    return true
  }

  function recognitionPayload(recordingId: string) {
    const language = options.language?.()
    return { recordingId, ...(language ? { language } : {}) }
  }

  /** Whether the clip is still this one: dismissed, sent or replaced meanwhile, it is not. */
  function stillHeld(held: DictationClip): DictationClip | null {
    return clip.value?.recording.id === held.recording.id ? clip.value : null
  }

  async function recognizeClip(): Promise<DictationClipOutcome | null> {
    const held = clip.value
    if (!held || held.busy || session) return null
    clip.value = { ...held, busy: 'recognizing' }
    let words: string
    try {
      const result = await sdk.transcribeRecording(recognitionPayload(held.recording.id))
      words = spokenSegment(result.text).trim()
    } catch (error) {
      const current = stillHeld(held)
      if (!current) return null
      clip.value = {
        ...current,
        busy: null,
        failure: classifyDictationFailure(error) ?? { kind: 'failed' }
      }
      return clip.value.outcome
    }
    const current = stillHeld(held)
    if (!current) return null
    if (!words) {
      // Nothing new: the clip keeps whatever words it already put in the draft.
      clip.value = { ...current, busy: null, failure: { kind: 'empty' } }
      return clip.value.outcome
    }
    // In place of the clip's earlier words while the draft is as the clip left it; after whatever
    // the user has written since otherwise, which stays untouched.
    const draftNow = options.draft.value
    const inPlace = draftNow === current.draft
    const before = inPlace ? current.before : draftNow
    const after = inPlace ? current.after : ''
    const { text, caret } = spliceDictation({ before, after, spoken: words })
    options.draft.value = text
    clip.value = {
      ...current,
      busy: null,
      failure: null,
      outcome: 'inserted',
      spoken: words,
      before,
      after,
      draft: text,
      original: inPlace ? current.original : draftNow
    }
    void nextTick(() => {
      options.onTextChange?.()
      focusedInput()?.setSelectionRange(caret, caret)
    })
    return 'inserted'
  }

  async function clipTranscript(): Promise<string> {
    const held = clip.value
    if (!held) throw new Error('VOICE_RECORDING_NOT_FOUND')
    if (held.outcome === 'inserted' && held.spoken) return held.spoken
    const result = await sdk.transcribeRecording(recognitionPayload(held.recording.id))
    return spokenSegment(result.text).trim()
  }

  function draftWithoutClip(): string {
    const held = clip.value
    const draftNow = options.draft.value
    return held && held.spoken && draftNow === held.draft ? held.original : draftNow
  }

  function markClipSending(sending: boolean, failure?: DictationFailureNotice | null): void {
    const held = clip.value
    if (!held) return
    clip.value = {
      ...held,
      busy: sending ? 'sending' : null,
      ...(failure === undefined ? {} : { failure })
    }
  }

  function takeClip(): DictationClip | null {
    const held = clip.value
    clip.value = null
    return held
  }

  function restoreClip(held: DictationClip): void {
    if (clip.value) {
      if (clip.value.recording.id !== held.recording.id) discardRecording(held.recording.id)
      return
    }
    clip.value = { ...held, busy: null }
  }

  function dismissClip(): void {
    replaceClip(null)
  }

  async function start(): Promise<void> {
    if (session) return
    if (readiness && !readiness.ready) {
      options.onNotice?.(notReadyNotice(readiness.reason))
      return
    }
    // A recogniser can be perfectly configured on a build that cannot open a microphone. Saying
    // so before the stream is attempted is the difference between a reason and a generic failure.
    if (capture && !capture.ready) {
      options.onNotice?.(captureNoticeKind(capture.reason))
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
    // A new recording replaces the clip on screen.
    replaceClip(null)
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
      allLevels: [],
      recording: null,
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
      // The audio stays with main once the session ends, for the voice clip (`DictationClip`).
      keepRecording: true,
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
      const snapshot = await sdk.getRecognitionStatus()
      readiness = snapshot.asr
      capture = snapshot.capture
      // Only the component-absent class withholds the entry: every other capture failure leaves a
      // button that can at least explain itself, and a user who fixed their device should find the
      // button where it was.
      captureBlocked.value =
        capture?.ready === false &&
        captureNoticeKind(capture.reason) === 'capture-component-missing'
    } catch {
      // Could not ask is not "not ready": the press still tries, and a failure is classified.
      readiness = null
      capture = undefined
      captureBlocked.value = false
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
  // Unmounting abandons the session without writing the draft back, and lets the clip go.
  onScopeDispose(() => {
    cancel({ restore: false })
    dismissClip()
  })

  return {
    state: readonly(state),
    levels: readonly(levels),
    elapsedMs: readonly(elapsedMs),
    outcome: readonly(outcome),
    active,
    captureBlocked: readonly(captureBlocked),
    toggle,
    start,
    stop,
    cancel,
    refreshReadiness,
    openMicrophoneSettings,
    clip: readonly(clip),
    recognizeClip,
    clipTranscript,
    draftWithoutClip,
    markClipSending,
    takeClip,
    restoreClip,
    dismissClip
  }
}
