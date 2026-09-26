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
    openMicrophoneSettings: vi.fn(async () => {})
  }
  return { sdk, streams, state }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve()
  await nextTick()
}

let fake: ReturnType<typeof createFakeSdk>
let notices: DictationNoticeKind[]
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
      onNotice: (kind) => notices.push(kind),
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
    // The next version of the partial replaces it rather than stacking on it.
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
})
