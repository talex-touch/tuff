// @vitest-environment jsdom
import type { StreamOptions } from '@talex-touch/utils/transport'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload,
  VoiceRecognitionStatusSnapshot
} from '@talex-touch/utils/transport/sdk/domains/voice'
import type { DictationNoticeKind } from './dictation-notice'
import { effectScope, nextTick, type Ref, ref, watch } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPOSER_MOTION } from './composer-motion'
import { useComposerDictation, type UseComposerDictationReturn } from './useComposerDictation'

interface FakeStream {
  payload: VoiceAsrStreamPayload
  options: StreamOptions<VoiceAsrStreamEvent>
  controller: {
    cancel: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    cancelled: false
    streamId: string
  }
  /** Hands the controller over when the handle was deferred. */
  release: () => void
}

function createFakeSdk() {
  const streams: FakeStream[] = []
  const state = {
    deferHandle: false,
    status: { asr: { ready: true }, stt: { ready: true } } as VoiceRecognitionStatusSnapshot,
    statusFails: false
  }
  const sdk = {
    asrStream: vi.fn(
      (payload: VoiceAsrStreamPayload, options: StreamOptions<VoiceAsrStreamEvent>) => {
        const controller = {
          cancel: vi.fn(),
          stop: vi.fn(),
          cancelled: false as const,
          streamId: `stream-${streams.length + 1}`
        }
        let release = (): void => {}
        const handle = state.deferHandle
          ? new Promise<typeof controller>((resolve) => {
              release = () => resolve(controller)
            })
          : Promise.resolve(controller)
        streams.push({ payload, options, controller, release: () => release() })
        return handle
      }
    ),
    getRecognitionStatus: vi.fn(async () => {
      if (state.statusFails) throw new Error('status read failed')
      return state.status
    }),
    openMicrophoneSettings: vi.fn(async () => {}),
    transcribeRecording: vi.fn(async (_payload: { recordingId: string; language?: string }) => ({
      text: ''
    })),
    discardRecording: vi.fn(async (_payload: { recordingId: string }) => {})
  }
  return { sdk, streams, state }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve()
  await nextTick()
}

let fake: ReturnType<typeof createFakeSdk>
let notices: DictationNoticeKind[]
/** The descriptions that rode along, one slot per notice: the sentence the toast would show. */
let noticeDetails: (string | undefined)[]
let input: HTMLTextAreaElement
let micButton: HTMLButtonElement
let scope: ReturnType<typeof effectScope>

function setup(initialDraft = ''): { draft: Ref<string>; dictation: UseComposerDictationReturn } {
  const draft = ref(initialDraft)
  input.value = initialDraft
  let dictation!: UseComposerDictationReturn
  scope.run(() => {
    // The page binds the field with v-model; the harness mirrors the draft into it the same way.
    watch(draft, (value) => (input.value = value), { flush: 'sync' })
    dictation = useComposerDictation({
      draft,
      input: () => input,
      language: () => 'zh',
      onNotice: (kind, detail) => {
        notices.push(kind)
        noticeDetails.push(detail)
      },
      sdk: fake.sdk
    })
  })
  return { draft, dictation }
}

function emit(stream: FakeStream | undefined, event: VoiceAsrStreamEvent): void {
  stream!.options.onData(event)
}

beforeEach(() => {
  vi.useFakeTimers()
  fake = createFakeSdk()
  notices = []
  noticeDetails = []
  scope = effectScope()
  document.body.innerHTML = ''
  const composer = document.createElement('div')
  input = document.createElement('textarea')
  micButton = document.createElement('button')
  composer.append(input, micButton)
  document.body.append(composer)
})

afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

describe('useComposerDictation', () => {
  it('asks for live, local, levelled text with the language hint', async () => {
    const { dictation } = setup()
    await dictation.start()
    expect(fake.streams[0]!.payload).toEqual({
      delivery: 'none',
      deliveryTiming: 'live',
      cleanup: true,
      emitLevel: true,
      keepRecording: true,
      language: 'zh'
    })
  })

  it('writes partials at the caret, commits finals, and hands the caret back at the end', async () => {
    const { draft, dictation } = setup('请帮我，谢谢')
    input.setSelectionRange(3, 3)
    await dictation.start()
    const stream = fake.streams[0]
    expect(dictation.state.value).toBe('starting')

    emit(stream, { type: 'ready' })
    expect(dictation.state.value).toBe('listening')
    // The room tone that opens the capture is silence; a voice over it draws (built-in
    // microphone levels, `voice-level.test.ts`).
    emit(stream, { type: 'level', rms: 0.0025 })
    expect(dictation.levels.value.at(-1)).toBe(0)
    emit(stream, { type: 'level', rms: 0.01 })
    expect(dictation.levels.value.at(-1)).toBe(1)
    expect(dictation.levels.value).toHaveLength(COMPOSER_MOTION.mic.levelHistory)

    emit(stream, { type: 'partial', text: '订' })
    expect(draft.value).toBe('请帮我订，谢谢')
    // The next version of the partial replaces it rather than stacking on it — also when the
    // provider revised it (a real capture: the trailing 。 turned into ， and a word changed).
    emit(stream, { type: 'partial', text: '订一张' })
    expect(draft.value).toBe('请帮我订一张，谢谢')
    emit(stream, { type: 'partial', text: '订一张明早的。' })
    emit(stream, { type: 'partial', text: '订一张明早的，去杭州' })
    expect(draft.value).toBe('请帮我订一张明早的，去杭州，谢谢')
    emit(stream, { type: 'partial', text: '订一张' })
    expect(draft.value).toBe('请帮我订一张，谢谢')
    emit(stream, { type: 'final', text: '订一张票' })
    expect(draft.value).toBe('请帮我订一张票，谢谢')

    vi.advanceTimersByTime(2000)
    expect(dictation.elapsedMs.value).toBe(2000)

    // Focus sat on the microphone key, inside the composer: it goes back to the field.
    micButton.focus()
    emit(stream, { type: 'end' })
    await settle()
    expect(dictation.state.value).toBe('idle')
    expect(dictation.outcome.value).toBe('inserted')
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe('请帮我订一张票'.length)
  })

  it('keeps focus where the user moved it', async () => {
    const elsewhere = document.createElement('button')
    document.body.append(elsewhere)
    const { dictation } = setup()
    await dictation.start()
    emit(fake.streams[0], { type: 'final', text: 'done' })
    elsewhere.focus()
    emit(fake.streams[0], { type: 'end' })
    await settle()
    expect(document.activeElement).toBe(elsewhere)
  })

  it('applies a stop asked for before the handle arrives as stop(), once, never cancel', async () => {
    fake.state.deferHandle = true
    const { draft, dictation } = setup()
    const starting = dictation.start()
    const stopped = dictation.stop()
    expect(dictation.state.value).toBe('finishing')

    fake.streams[0]!.release()
    await starting
    const { controller } = fake.streams[0]!
    expect(controller.stop).toHaveBeenCalledTimes(1)
    expect(controller.cancel).not.toHaveBeenCalled()

    // A second stop does not stop twice; both callers learn the same ending.
    const again = dictation.stop()
    expect(controller.stop).toHaveBeenCalledTimes(1)

    emit(fake.streams[0], { type: 'ready' })
    expect(dictation.state.value).toBe('finishing')
    emit(fake.streams[0], { type: 'final', text: 'hello' })
    emit(fake.streams[0], { type: 'end' })
    await expect(stopped).resolves.toBe('inserted')
    await expect(again).resolves.toBe('inserted')
    expect(draft.value).toBe('hello')
  })

  it('cancels, restores the draft and drops every late callback', async () => {
    const { draft, dictation } = setup('keep me')
    input.setSelectionRange(7, 7)
    await dictation.start()
    const stream = fake.streams[0]
    emit(stream, { type: 'ready' })
    emit(stream, { type: 'partial', text: 'extra' })
    expect(draft.value).toBe('keep me extra')

    dictation.cancel()
    expect(stream!.controller.cancel).toHaveBeenCalledOnce()
    expect(draft.value).toBe('keep me')
    expect(dictation.state.value).toBe('idle')
    expect(dictation.outcome.value).toBe('cancelled')

    emit(stream, { type: 'partial', text: 'late' })
    emit(stream, { type: 'final', text: 'late' })
    stream!.options.onError?.(new Error('late failure'))
    stream!.options.onEnd?.()
    expect(draft.value).toBe('keep me')
    expect(notices).toEqual([])
  })

  it('cancels a handle that arrives after the session was cancelled', async () => {
    fake.state.deferHandle = true
    const { dictation } = setup()
    const starting = dictation.start()
    dictation.cancel()
    fake.streams[0]!.release()
    await starting
    expect(fake.streams[0]!.controller.cancel).toHaveBeenCalledOnce()
  })

  it('ignores an older session once a newer one runs', async () => {
    const { draft, dictation } = setup()
    await dictation.start()
    const first = fake.streams[0]
    dictation.cancel()
    await dictation.start()
    const second = fake.streams[1]

    emit(first, { type: 'partial', text: 'stale' })
    expect(draft.value).toBe('')
    emit(second, { type: 'partial', text: 'fresh' })
    expect(draft.value).toBe('fresh')
  })

  it('gives up on a microphone that neither opens nor sends a level within 2s', async () => {
    const { dictation } = setup('draft')
    await dictation.start()
    vi.advanceTimersByTime(COMPOSER_MOTION.mic.captureWatchdogMs - 1)
    expect(fake.streams[0]!.controller.cancel).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fake.streams[0]!.controller.cancel).toHaveBeenCalledOnce()
    expect(notices).toEqual(['microphone-unresponsive'])
    expect(dictation.state.value).toBe('idle')
  })

  it('keeps the watchdog quiet once the capture opened', async () => {
    const { dictation } = setup()
    await dictation.start()
    vi.advanceTimersByTime(1000)
    emit(fake.streams[0], { type: 'level', rms: 0.03 })
    vi.advanceTimersByTime(5000)
    expect(fake.streams[0]!.controller.cancel).not.toHaveBeenCalled()
    expect(notices).toEqual([])
    expect(dictation.state.value).toBe('listening')
  })

  it('restores the draft and says so when nothing was recognized', async () => {
    const { draft, dictation } = setup('before')
    await dictation.start()
    emit(fake.streams[0], { type: 'ready' })
    emit(fake.streams[0], { type: 'final', text: '' })
    emit(fake.streams[0], { type: 'end' })
    expect(draft.value).toBe('before')
    expect(dictation.outcome.value).toBe('empty')
    expect(notices).toEqual(['empty'])
  })

  it('ends a silent session untouched, though the recognizer answered it with punctuation', async () => {
    const { draft, dictation } = setup('before')
    input.setSelectionRange(6, 6)
    const drafts: string[] = []
    scope.run(() => watch(draft, (value) => drafts.push(value), { flush: 'sync' }))
    await dictation.start()
    emit(fake.streams[0], { type: 'ready' })
    // What a real silent capture sent: this partial first, and the same again as the final.
    emit(fake.streams[0], { type: 'partial', text: '。。。。。。。。。。' })
    emit(fake.streams[0], { type: 'final', text: '。。。。。。。。。。' })
    emit(fake.streams[0], { type: 'end' })
    expect(drafts).toEqual([])
    expect(draft.value).toBe('before')
    expect(dictation.outcome.value).toBe('empty')
    expect(notices).toEqual(['empty'])
  })

  it('never shows a subtitle credit heard in the silence, not even as a passing partial', async () => {
    const { draft, dictation } = setup()
    const drafts: string[] = []
    scope.run(() => watch(draft, (value) => drafts.push(value), { flush: 'sync' }))
    await dictation.start()
    emit(fake.streams[0], { type: 'ready' })
    emit(fake.streams[0], { type: 'partial', text: '(字幕:J Chong)' })
    expect(draft.value).toBe('')
    emit(fake.streams[0], { type: 'partial', text: '明天' })
    emit(fake.streams[0], { type: 'final', text: '明天见' })
    emit(fake.streams[0], { type: 'partial', text: '字幕由Amara.org社区提供' })
    emit(fake.streams[0], { type: 'end' })
    expect(drafts).toEqual(['明天', '明天见'])
    expect(dictation.outcome.value).toBe('inserted')
  })

  it('keeps what was shown when the stream fails, and names the failure', async () => {
    const { draft, dictation } = setup()
    await dictation.start()
    emit(fake.streams[0], { type: 'ready' })
    emit(fake.streams[0], { type: 'partial', text: 'half a sentence' })
    fake.streams[0]!.options.onError?.(
      Object.assign(new Error('denied'), { code: 'MIC_PERMISSION_DENIED' })
    )
    expect(draft.value).toBe('half a sentence')
    expect(dictation.outcome.value).toBe('failed')
    expect(notices).toEqual(['microphone-denied'])
    // The description rides along: it is the only thing that tells an absent audio addon apart
    // from a permission the user can actually grant.
    expect(noticeDetails).toEqual(['denied'])
  })

  it('says nothing for a cancellation error', async () => {
    const { dictation } = setup()
    await dictation.start()
    fake.streams[0]!.options.onError?.(new Error('VOICE_OPERATION_CANCELLED'))
    expect(notices).toEqual([])
    expect(dictation.state.value).toBe('idle')
  })

  it('does not open a stream while recognition reports it is not ready', async () => {
    fake.state.status = {
      asr: { ready: false, reason: 'VOICE_ASR_NOT_CONFIGURED' },
      stt: { ready: false }
    }
    const { dictation } = setup()
    await dictation.refreshReadiness()
    await dictation.start()
    expect(fake.sdk.asrStream).not.toHaveBeenCalled()
    expect(notices).toEqual(['recognition-not-configured'])
    expect(dictation.state.value).toBe('idle')
  })

  it('still tries when the readiness read itself failed', async () => {
    fake.state.statusFails = true
    const { dictation } = setup()
    await dictation.refreshReadiness()
    await dictation.start()
    expect(fake.sdk.asrStream).toHaveBeenCalledOnce()
  })

  it('never opens a stream on a build without its audio addon', async () => {
    fake.state.status = {
      asr: { ready: true },
      stt: { ready: true },
      capture: { ready: false, reason: 'VOICE_ASR_CAPTURE_COMPONENT_MISSING' }
    }
    const { dictation } = setup()
    await dictation.refreshReadiness()
    expect(dictation.captureBlocked.value).toBe(true)

    await dictation.start()
    // The point of the gate: nothing is attempted, so main never has to fail a capture this
    // install cannot perform, and the entry point is withheld rather than offered.
    expect(fake.sdk.asrStream).not.toHaveBeenCalled()
    expect(notices).toEqual(['capture-component-missing'])
    expect(dictation.state.value).toBe('idle')
  })

  it('keeps offering the microphone for a device problem, and names it on the press', async () => {
    fake.state.status = {
      asr: { ready: true },
      stt: { ready: true },
      capture: { ready: false, reason: 'VOICE_ASR_CAPTURE_DEVICE_UNAVAILABLE' }
    }
    const { dictation } = setup()
    await dictation.refreshReadiness()
    // A microphone the user can plug back in is not a reason to hide the button.
    expect(dictation.captureBlocked.value).toBe(false)

    await dictation.start()
    expect(fake.sdk.asrStream).not.toHaveBeenCalled()
    expect(notices).toEqual(['microphone-missing'])
  })

  it('opens the stream when the build can capture', async () => {
    fake.state.status = { asr: { ready: true }, stt: { ready: true }, capture: { ready: true } }
    const { dictation } = setup()
    await dictation.refreshReadiness()
    expect(dictation.captureBlocked.value).toBe(false)
    await dictation.start()
    expect(fake.sdk.asrStream).toHaveBeenCalledOnce()
  })

  it('puts the microphone back, and tries the stream, when a later status read fails', async () => {
    fake.state.status = {
      asr: { ready: true },
      stt: { ready: true },
      capture: { ready: false, reason: 'VOICE_ASR_CAPTURE_COMPONENT_MISSING' }
    }
    const { dictation } = setup()
    await dictation.refreshReadiness()
    expect(dictation.captureBlocked.value).toBe(true)

    // Could not ask is not a verdict: the entry comes back, and the press classifies whatever
    // fails on its own rather than on a stale answer from the read that worked.
    fake.state.statusFails = true
    await dictation.refreshReadiness()
    expect(dictation.captureBlocked.value).toBe(false)

    await dictation.start()
    expect(fake.sdk.asrStream).toHaveBeenCalledOnce()
  })

  it('toggles: start when idle, stop while listening, nothing while finishing', async () => {
    const { dictation } = setup()
    dictation.toggle()
    await settle()
    expect(fake.sdk.asrStream).toHaveBeenCalledOnce()
    emit(fake.streams[0], { type: 'ready' })
    dictation.toggle()
    expect(dictation.state.value).toBe('finishing')
    expect(fake.streams[0]!.controller.stop).toHaveBeenCalledOnce()
    dictation.toggle()
    expect(fake.streams[0]!.controller.stop).toHaveBeenCalledOnce()
    expect(fake.sdk.asrStream).toHaveBeenCalledOnce()
  })

  it('resolves a stop with nothing running to null', async () => {
    const { dictation } = setup()
    await expect(dictation.stop()).resolves.toBeNull()
  })

  it('abandons the session on unmount without writing the draft back', async () => {
    const { draft, dictation } = setup()
    await dictation.start()
    emit(fake.streams[0], { type: 'partial', text: 'spoken' })
    scope.stop()
    expect(fake.streams[0]!.controller.cancel).toHaveBeenCalledOnce()
    expect(draft.value).toBe('spoken')
    expect(dictation.state.value).toBe('idle')
  })

  describe('voice clip', () => {
    const recording = { id: 'clip-1', url: 'tfile:///clip-1.wav', durationMs: 2_000 }

    /** A session that heard `words` (if any), kept its audio, and ended — or failed with `error`. */
    async function finishSession(
      dictation: UseComposerDictationReturn,
      { words, error }: { words?: string; error?: Error } = {}
    ): Promise<void> {
      await dictation.start()
      const stream = fake.streams.at(-1)
      emit(stream, { type: 'ready' })
      emit(stream, { type: 'level', rms: 0.002 })
      emit(stream, { type: 'level', rms: 0.02 })
      if (words) emit(stream, { type: 'final', text: words })
      emit(stream, { type: 'recording', recording })
      if (error) stream!.options.onError?.(error)
      else emit(stream, { type: 'end' })
      await settle()
    }

    it('offers the kept audio once words have landed, with a waveform of the whole session', async () => {
      const { draft, dictation } = setup('请')
      input.setSelectionRange(1, 1)

      await finishSession(dictation, { words: '帮我看看' })

      expect(draft.value).toBe('请帮我看看')
      expect(dictation.clip.value).toMatchObject({
        recording,
        outcome: 'inserted',
        failure: null,
        spoken: '帮我看看',
        draft: '请帮我看看',
        original: '请',
        busy: null
      })
      expect(dictation.clip.value!.peaks).toHaveLength(2)
      expect(notices).toEqual([])
    })

    it('carries a failure on the clip instead of a toast, the draft as it was', async () => {
      const { draft, dictation } = setup('原稿')

      await finishSession(dictation, {
        error: Object.assign(new Error('socket closed'), { code: 'NETWORK_FAILURE' })
      })

      expect(draft.value).toBe('原稿')
      expect(dictation.clip.value).toMatchObject({ outcome: 'failed', spoken: '' })
      expect(dictation.clip.value!.failure?.kind).toBe('failed')
      expect(notices).toEqual([])
    })

    it('still toasts a failure that left no audio behind', async () => {
      const { dictation } = setup()
      await dictation.start()
      fake.streams[0]!.options.onError?.(
        Object.assign(new Error('denied'), { code: 'MIC_PERMISSION_DENIED' })
      )

      expect(dictation.clip.value).toBeNull()
      expect(notices).toEqual(['microphone-denied'])
    })

    it('says "nothing heard" on the clip rather than in a toast', async () => {
      const { dictation } = setup()

      await finishSession(dictation)

      expect(dictation.clip.value).toMatchObject({ outcome: 'empty', spoken: '' })
      expect(notices).toEqual([])
    })

    it('recognizes again in place of its own words while the draft is untouched', async () => {
      const { draft, dictation } = setup('请')
      input.setSelectionRange(1, 1)
      await finishSession(dictation, { words: '帮我看' })
      fake.sdk.transcribeRecording.mockResolvedValueOnce({ text: '帮我看看这个分支' })

      await expect(dictation.recognizeClip()).resolves.toBe('inserted')

      expect(fake.sdk.transcribeRecording).toHaveBeenCalledWith({
        recordingId: 'clip-1',
        language: 'zh'
      })
      expect(draft.value).toBe('请帮我看看这个分支')
      expect(dictation.clip.value).toMatchObject({ spoken: '帮我看看这个分支', original: '请' })
    })

    it('adds the words after an edited draft and leaves the edit alone', async () => {
      const { draft, dictation } = setup()
      await finishSession(dictation, {
        error: Object.assign(new Error('socket closed'), { code: 'NETWORK_FAILURE' })
      })
      draft.value = '我自己写的'
      fake.sdk.transcribeRecording.mockResolvedValueOnce({ text: '补上的话' })

      await dictation.recognizeClip()

      expect(draft.value).toBe('我自己写的补上的话')
      expect(dictation.clip.value).toMatchObject({ outcome: 'inserted', failure: null })
      // Taking the words back out returns the draft to the user's own edit.
      expect(dictation.draftWithoutClip()).toBe('我自己写的')
    })

    it('keeps a second failure on the clip, and the clip with it', async () => {
      const { dictation } = setup()
      await finishSession(dictation, {
        error: Object.assign(new Error('socket closed'), { code: 'NETWORK_FAILURE' })
      })
      fake.sdk.transcribeRecording.mockRejectedValueOnce(
        Object.assign(new Error('Too many requests'), { code: 'RATE_LIMITED' })
      )

      await expect(dictation.recognizeClip()).resolves.toBe('failed')

      expect(dictation.clip.value?.failure?.kind).toBe('busy')
      expect(dictation.clip.value?.busy).toBeNull()
    })

    it('hands its own words to a send, and recognizes them when it has none', async () => {
      const { dictation } = setup()
      await finishSession(dictation, { words: '已经听写好的' })
      await expect(dictation.clipTranscript()).resolves.toBe('已经听写好的')
      expect(fake.sdk.transcribeRecording).not.toHaveBeenCalled()

      await finishSession(dictation)
      fake.sdk.transcribeRecording.mockResolvedValueOnce({ text: '。。。' })
      // Silence comes back as punctuation: nothing to send.
      await expect(dictation.clipTranscript()).resolves.toBe('')
    })

    it('takes its words back out of the draft only while they sit as they landed', async () => {
      const { draft, dictation } = setup('前文')
      input.setSelectionRange(2, 2)
      await finishSession(dictation, { words: '语音' })
      expect(dictation.draftWithoutClip()).toBe('前文')

      draft.value = '前文语音，改过'
      expect(dictation.draftWithoutClip()).toBe('前文语音，改过')
    })

    it('lets the old clip go when a new recording starts, and on dismiss', async () => {
      const { dictation } = setup()
      await finishSession(dictation, { words: '第一段' })

      await dictation.start()
      expect(dictation.clip.value).toBeNull()
      expect(fake.sdk.discardRecording).toHaveBeenCalledWith({ recordingId: 'clip-1' })

      dictation.cancel()
      await finishSession(dictation, { words: '第二段' })
      dictation.dismissClip()
      expect(fake.sdk.discardRecording).toHaveBeenCalledTimes(2)
      expect(dictation.clip.value).toBeNull()
    })

    it('hands a clip to a send without discarding it, and takes it back if the send fails', async () => {
      const { dictation } = setup()
      await finishSession(dictation, { words: '要发出去的' })

      const taken = dictation.takeClip()
      expect(dictation.clip.value).toBeNull()
      expect(fake.sdk.discardRecording).not.toHaveBeenCalled()

      dictation.restoreClip(taken!)
      expect(dictation.clip.value).toMatchObject({ spoken: '要发出去的', busy: null })
    })

    it('lets the clip go when the page unmounts', async () => {
      const { dictation } = setup()
      await finishSession(dictation, { words: '离开' })

      scope.stop()

      expect(fake.sdk.discardRecording).toHaveBeenCalledWith({ recordingId: 'clip-1' })
    })
  })
})
