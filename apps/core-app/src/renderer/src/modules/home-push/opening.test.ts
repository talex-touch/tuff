import type { StreamController } from '@talex-touch/utils/transport'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceStreamEvent,
  IntelligenceStreamOptions
} from '@talex-touch/utils/types/intelligence'
import type { HomeOpeningRequest, HomeOpeningSdk } from './opening'
import { INTELLIGENCE_HOME_OPENING_OPERATION } from '@talex-touch/utils/types/intelligence'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conversation, fakeT, MINUTE, NOW, project, session, signalsOf } from './home-push.fixtures'
import {
  buildHomeOpeningRequest,
  createHomeOpening,
  createHomeOpeningCache,
  createOpeningLeadNote,
  HOME_OPENING_MAX_CODEPOINTS,
  HOME_OPENING_REUSE_WINDOW_MS,
  HOME_OPENING_SKELETON_MS,
  HOME_OPENING_WAIT_MS,
  resolveTemplateOpening,
  sanitizeOpeningText
} from './opening'

const DELTA: IntelligenceStreamEvent<string> = { type: 'delta', capabilityId: 'text.chat' }
const END: IntelligenceStreamEvent<string> = { type: 'end', capabilityId: 'text.chat' }

interface StreamCall {
  capabilityId: string
  payload: IntelligenceChatPayload
  invokeOptions: IntelligenceInvokeOptions | undefined
  handlers: IntelligenceStreamOptions<string>
  controller: StreamController & { cancel: ReturnType<typeof vi.fn> }
}

/**
 * A stream double that records every call. By default the handshake resolves at once; `start`
 * replaces it, to hold the controller back or to fail the handshake.
 */
function createStreamDouble(start?: (call: StreamCall) => Promise<StreamController>) {
  const calls: StreamCall[] = []
  const sdk: HomeOpeningSdk = {
    stream: (capabilityId, payload, handlers, invokeOptions) => {
      const call: StreamCall = {
        capabilityId,
        payload,
        invokeOptions,
        handlers,
        controller: { cancel: vi.fn(), cancelled: false, streamId: `opening-${calls.length}` }
      }
      calls.push(call)
      return start ? start(call) : Promise.resolve(call.controller)
    }
  }
  const last = (): StreamCall => {
    const call = calls[calls.length - 1]
    if (!call) throw new Error('no stream was started')
    return call
  }
  return { sdk, calls, last }
}

function request(overrides: Partial<HomeOpeningRequest> = {}): HomeOpeningRequest {
  return {
    prompt: 'PROMPT',
    summary: 'SUMMARY',
    fingerprint: 'fp-1',
    fallback: 'TEMPLATE',
    ...overrides
  }
}

let clock = NOW
const now = (): number => clock

beforeEach(() => {
  clock = NOW
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Settles the handshake promise and anything chained to it. */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('home opening state machine', () => {
  it('holds the skeleton until the first visible token, then streams to done', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    expect(opening.phase.value).toBe('pending')
    expect(opening.text.value).toBe('')

    // Whitespace is not a first token: the skeleton stays.
    double.last().handlers.onDelta?.('\n', DELTA)
    expect(opening.phase.value).toBe('pending')

    double.last().handlers.onDelta?.('你好，', DELTA)
    expect(opening.phase.value).toBe('streaming')
    expect(opening.text.value).toBe('你好，')

    double.last().handlers.onDelta?.('我是塔芙。', DELTA)
    double.last().handlers.onEnd?.(END)
    expect(opening.phase.value).toBe('done')
    expect(opening.text.value).toBe('你好，我是塔芙。')
    expect(opening.source.value).toBe('model')
    expect(double.last().controller.cancel).not.toHaveBeenCalled()
  })

  it('makes one low-stakes call on the composer’s route: no home surface, no effort', () => {
    const double = createStreamDouble()
    let routing: { providerId?: string; model?: string } | undefined
    const opening = createHomeOpening({
      sdk: double.sdk,
      routing: () => routing,
      cache: createHomeOpeningCache(),
      now
    })

    opening.start(request())

    expect(double.calls).toHaveLength(1)
    const call = double.last()
    expect(call.capabilityId).toBe('text.chat')
    expect(call.payload.messages).toEqual([
      { role: 'system', content: 'PROMPT' },
      { role: 'user', content: 'SUMMARY' }
    ])
    // A cost ceiling that still fits the longest opening shown at two tokens a CJK character: a
    // lower one lets the provider cut a Chinese opening mid-sentence before the shaping can.
    expect(call.payload.maxTokens).toBeGreaterThanOrEqual(2 * HOME_OPENING_MAX_CODEPOINTS)
    expect(call.payload.maxTokens).toBeLessThanOrEqual(400)
    // Exactly this: a surface would inject skills and open a native session, and the composer's
    // effort would think hard about two sentences of greeting.
    expect(call.invokeOptions).toEqual({
      timeout: HOME_OPENING_WAIT_MS,
      metadata: { operation: INTELLIGENCE_HOME_OPENING_OPERATION }
    })

    // A pinned model is the chat's route, so it is the opening's too — read as each one starts.
    routing = { providerId: 'claude-cli', model: 'claude-opus-5-5' }
    opening.start(request({ fingerprint: 'fp-2' }))
    expect(double.last().invokeOptions).toEqual({
      preferredProviderId: 'claude-cli',
      modelPreference: ['claude-opus-5-5'],
      timeout: HOME_OPENING_WAIT_MS,
      metadata: { operation: INTELLIGENCE_HOME_OPENING_OPERATION }
    })
  })

  it('writes nothing while the user has not turned it on: the template, and no call', async () => {
    const double = createStreamDouble()
    const cache = createHomeOpeningCache()
    // Even an opening the model wrote before, still inside the reuse window, stays unshown.
    cache.write({ fingerprint: 'fp-1', text: '上次的开场白。', at: clock })
    let enabled = false
    const opening = createHomeOpening({ sdk: double.sdk, enabled: () => enabled, cache, now })

    opening.start(request())
    await flush()
    vi.advanceTimersByTime(HOME_OPENING_WAIT_MS)
    expect(double.calls).toHaveLength(0)
    expect(opening.phase.value).toBe('fallback')
    expect(opening.text.value).toBe('TEMPLATE')
    expect(opening.takeLead()).toBeNull()

    // Read as each opening starts: turned on, the next blank conversation asks again.
    enabled = true
    opening.start(request({ fingerprint: 'fp-2' }))
    expect(double.calls).toHaveLength(1)
  })

  it('stands the template in after 2.5s, then swaps in the whole opening', async () => {
    const double = createStreamDouble()
    const cache = createHomeOpeningCache()
    const opening = createHomeOpening({ sdk: double.sdk, cache, now })

    opening.start(request())
    await flush()
    vi.advanceTimersByTime(HOME_OPENING_SKELETON_MS - 1)
    expect(opening.phase.value).toBe('pending')

    vi.advanceTimersByTime(1)
    expect(opening.phase.value).toBe('interim')
    expect(opening.text.value).toBe('TEMPLATE')
    expect(opening.source.value).toBe('template')
    expect(double.last().controller.cancel).not.toHaveBeenCalled()

    // No half-sentence grows over the template: the words wait until the opening is whole.
    double.last().handlers.onDelta?.('欢迎回来，', DELTA)
    expect(opening.phase.value).toBe('interim')
    expect(opening.text.value).toBe('TEMPLATE')

    double.last().handlers.onDelta?.('接着聊？', DELTA)
    double.last().handlers.onEnd?.(END)
    expect(opening.phase.value).toBe('done')
    expect(opening.text.value).toBe('欢迎回来，接着聊？')
    expect(opening.source.value).toBe('model')
    expect(cache.read()?.text).toBe('欢迎回来，接着聊？')
  })

  it('keeps the template when the stream fails while it stands in', async () => {
    const double = createStreamDouble()
    const cache = createHomeOpeningCache()
    const opening = createHomeOpening({ sdk: double.sdk, cache, now })

    opening.start(request())
    await flush()
    vi.advanceTimersByTime(HOME_OPENING_SKELETON_MS)
    double.last().handlers.onDelta?.('第一句说完了。第二', DELTA)
    double.last().handlers.onError?.(new Error('connection reset'))

    expect(opening.phase.value).toBe('fallback')
    expect(opening.text.value).toBe('TEMPLATE')
    expect(cache.read()).toBeNull()
  })

  it('gives the model 30s, then keeps the template for good', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    vi.advanceTimersByTime(HOME_OPENING_WAIT_MS - 1)
    expect(opening.phase.value).toBe('interim')

    vi.advanceTimersByTime(1)
    expect(opening.phase.value).toBe('fallback')
    expect(opening.text.value).toBe('TEMPLATE')
    expect(opening.source.value).toBe('template')
    expect(double.last().controller.cancel).toHaveBeenCalledTimes(1)

    // A stream that ignores the cancel still cannot take the template's place.
    double.last().handlers.onDelta?.('迟到的开场白。', DELTA)
    double.last().handlers.onEnd?.(END)
    expect(opening.phase.value).toBe('fallback')
    expect(opening.text.value).toBe('TEMPLATE')
  })

  it('counts both waits from when the reader started waiting', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request(), { startedAt: clock - 2000 })
    await flush()
    vi.advanceTimersByTime(HOME_OPENING_SKELETON_MS - 2000 - 1)
    expect(opening.phase.value).toBe('pending')
    vi.advanceTimersByTime(1)
    expect(opening.phase.value).toBe('interim')
    vi.advanceTimersByTime(HOME_OPENING_WAIT_MS - HOME_OPENING_SKELETON_MS - 1)
    expect(opening.phase.value).toBe('interim')
    vi.advanceTimersByTime(1)
    expect(opening.phase.value).toBe('fallback')
  })

  it('makes no call once the local reads have used up the whole wait', () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request(), { startedAt: clock - HOME_OPENING_WAIT_MS })

    expect(double.calls).toHaveLength(0)
    expect(opening.phase.value).toBe('fallback')
    expect(opening.text.value).toBe('TEMPLATE')
    expect(opening.takeLead()).toBeNull()
  })

  it('shows the template at once when no provider can start the stream', async () => {
    const double = createStreamDouble(() => Promise.reject(new Error('PROVIDER_UNAVAILABLE')))
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()

    expect(opening.phase.value).toBe('fallback')
    expect(opening.text.value).toBe('TEMPLATE')
    // No non-streaming second attempt: the double would have recorded it.
    expect(double.calls).toHaveLength(1)
  })

  it('shows the template when the stream fails before any token', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    double.last().handlers.onError?.(new Error('boom'))

    expect(opening.phase.value).toBe('fallback')
    expect(opening.text.value).toBe('TEMPLATE')
  })

  it('shows the template when a stream ends without anything visible', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    double.last().handlers.onDelta?.('  ', DELTA)
    double.last().handlers.onEnd?.(END)

    expect(opening.phase.value).toBe('fallback')
  })

  it('keeps what arrived when the stream fails midway, without caching it', async () => {
    const double = createStreamDouble()
    const cache = createHomeOpeningCache()
    const opening = createHomeOpening({ sdk: double.sdk, cache, now })

    opening.start(request())
    await flush()
    double.last().handlers.onDelta?.('第一句说完了。第二', DELTA)
    double.last().handlers.onError?.(new Error('connection reset'))

    expect(opening.phase.value).toBe('done')
    expect(opening.text.value).toBe('第一句说完了。第二')
    expect(cache.read()).toBeNull()
  })

  it('stops paying for the stream once the opening is complete', async () => {
    const double = createStreamDouble()
    const cache = createHomeOpeningCache()
    const opening = createHomeOpening({ sdk: double.sdk, cache, now })

    opening.start(request())
    await flush()
    double.last().handlers.onDelta?.('一。二。三。', DELTA)
    expect(opening.phase.value).toBe('streaming')
    double.last().handlers.onDelta?.('四', DELTA)

    expect(opening.phase.value).toBe('done')
    expect(opening.text.value).toBe('一。二。三。')
    expect(double.last().controller.cancel).toHaveBeenCalledTimes(1)
    expect(cache.read()?.text).toBe('一。二。三。')
  })

  it('replays an unchanged summary for ten minutes, then asks again', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    double.last().handlers.onDelta?.('欢迎回来。', DELTA)
    double.last().handlers.onEnd?.(END)

    clock += HOME_OPENING_REUSE_WINDOW_MS - MINUTE
    opening.start(request())
    expect(double.calls).toHaveLength(1)
    expect(opening.phase.value).toBe('done')
    expect(opening.text.value).toBe('欢迎回来。')
    expect(opening.source.value).toBe('cache')

    // Reuse does not extend the window: it runs from when the opening was written.
    clock += MINUTE
    opening.start(request())
    expect(double.calls).toHaveLength(2)
    expect(opening.phase.value).toBe('pending')
  })

  it('asks again as soon as the summary changes', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    double.last().handlers.onDelta?.('欢迎回来。', DELTA)
    double.last().handlers.onEnd?.(END)

    opening.start(request({ fingerprint: 'fp-2' }))
    expect(double.calls).toHaveLength(2)
    expect(opening.phase.value).toBe('pending')
  })

  it('never caches a template, so the next blank conversation tries the model again', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    vi.advanceTimersByTime(HOME_OPENING_WAIT_MS)
    expect(opening.phase.value).toBe('fallback')

    opening.start(request())
    expect(double.calls).toHaveLength(2)
  })

  it('replaces an opening still in flight when a new one starts', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    const first = double.last()
    opening.start(request({ fingerprint: 'fp-2', fallback: 'OTHER' }))
    await flush()

    expect(first.controller.cancel).toHaveBeenCalledTimes(1)
    first.handlers.onDelta?.('旧的。', DELTA)
    expect(opening.phase.value).toBe('pending')
    expect(opening.text.value).toBe('')
  })

  it('drops an opening in flight on cancel, including a controller that arrives later', async () => {
    let release: ((controller: StreamController) => void) | undefined
    const double = createStreamDouble(
      () =>
        new Promise<StreamController>((resolve) => {
          release = resolve
        })
    )
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    opening.cancel()
    expect(opening.phase.value).toBe('cancelled')

    release?.(double.last().controller)
    await flush()
    expect(double.last().controller.cancel).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(HOME_OPENING_WAIT_MS)
    expect(opening.phase.value).toBe('cancelled')
  })
})

describe('taking the opening as the conversation’s first message', () => {
  it('hands over a finished opening, once', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    double.last().handlers.onDelta?.('要先推进哪件事？', DELTA)
    double.last().handlers.onEnd?.(END)

    expect(opening.takeLead()).toBe('要先推进哪件事？')
    expect(opening.takeLead()).toBeNull()
  })

  it('hands over a replayed opening too', async () => {
    const double = createStreamDouble()
    const cache = createHomeOpeningCache()
    cache.write({ fingerprint: 'fp-1', text: '上次的开场白。', at: clock })
    const opening = createHomeOpening({ sdk: double.sdk, cache, now })

    opening.start(request())
    expect(double.calls).toHaveLength(0)
    expect(opening.takeLead()).toBe('上次的开场白。')
  })

  it('cancels an opening still streaming and hands over nothing', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    double.last().handlers.onDelta?.('你好，我', DELTA)

    expect(opening.takeLead()).toBeNull()
    expect(opening.phase.value).toBe('cancelled')
    expect(double.last().controller.cancel).toHaveBeenCalledTimes(1)
    double.last().handlers.onDelta?.('是塔芙。', DELTA)
    expect(opening.text.value).toBe('')
  })

  it('cancels an opening still waiting for its first token', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    expect(opening.takeLead()).toBeNull()
    expect(double.last().controller.cancel).toHaveBeenCalledTimes(1)
  })

  it('never hands over the template: the model did not say it', async () => {
    const double = createStreamDouble()
    const opening = createHomeOpening({ sdk: double.sdk, cache: createHomeOpeningCache(), now })

    opening.start(request())
    await flush()
    vi.advanceTimersByTime(HOME_OPENING_WAIT_MS)
    expect(opening.phase.value).toBe('fallback')
    expect(opening.takeLead()).toBeNull()

    // Nor while it stands in: the opening still being written is dropped with it.
    opening.start(request())
    await flush()
    vi.advanceTimersByTime(HOME_OPENING_SKELETON_MS)
    expect(opening.phase.value).toBe('interim')
    expect(opening.takeLead()).toBeNull()
    expect(double.last().controller.cancel).toHaveBeenCalledTimes(1)
  })
})

describe('sanitizeOpeningText', () => {
  it('flattens lines and drops Markdown, keeping CJK sentences unspaced', () => {
    expect(
      sanitizeOpeningText('**你好**，我是塔芙。\n\n要不要先看看 talex-touch？', { final: true })
    ).toEqual({ text: '你好，我是塔芙。要不要先看看 talex-touch？', complete: false })
  })

  it('joins Latin lines with a space', () => {
    expect(sanitizeOpeningText('Hi there.\nWant to start?', { final: true }).text).toBe(
      'Hi there. Want to start?'
    )
  })

  it('cuts back to three sentences once a fourth starts', () => {
    expect(sanitizeOpeningText('One. Two! Three? Four')).toEqual({
      text: 'One. Two! Three?',
      complete: true
    })
    // Three sentences and nothing after them is not a cut.
    expect(sanitizeOpeningText('One. Two! Three?')).toEqual({
      text: 'One. Two! Three?',
      complete: false
    })
  })

  it('does not end a sentence on a decimal point', () => {
    // Cut after the third real sentence — a `3.` counted as one would cut inside the version.
    expect(sanitizeOpeningText('一。二。版本 3.5 好了。四')).toEqual({
      text: '一。二。版本 3.5 好了。',
      complete: true
    })
  })

  it(`keeps to ${HOME_OPENING_MAX_CODEPOINTS} characters, cutting at a sentence end`, () => {
    const sentence = `${'很'.repeat(70)}。`
    const shaped = sanitizeOpeningText(`${sentence}${sentence}${'还'.repeat(30)}`, { final: true })
    expect(shaped).toEqual({ text: `${sentence}${sentence}`, complete: true })
  })

  it('clips one overlong sentence rather than dropping it', () => {
    const shaped = sanitizeOpeningText('长'.repeat(400), { final: true })
    expect([...shaped.text]).toHaveLength(HOME_OPENING_MAX_CODEPOINTS)
    expect(shaped.text.endsWith('…')).toBe(true)
    expect(shaped.complete).toBe(true)
  })

  it('unwraps a reply quoted whole, but not a quoted title at its start', () => {
    expect(sanitizeOpeningText('“Hello there.”', { final: true }).text).toBe('Hello there.')
    expect(sanitizeOpeningText('「整理下载目录」还没做完。', { final: true }).text).toBe(
      '「整理下载目录」还没做完。'
    )
  })
})

describe('resolveTemplateOpening', () => {
  const projects = [project({ id: 'p1', name: 'talex-touch' })]

  it('centres a project’s blank conversation on that project', () => {
    expect(
      resolveTemplateOpening(
        signalsOf({
          projects,
          activeProjectId: 'p1',
          conversations: [conversation({ id: 'c', projectId: 'p1', title: '软著材料' })]
        }),
        fakeT
      )
    ).toBe('home.opening.template.projectConversation{"project":"talex-touch","title":"软著材料"}')
    expect(resolveTemplateOpening(signalsOf({ projects, activeProjectId: 'p1' }), fakeT)).toBe(
      'home.opening.template.project{"project":"talex-touch"}'
    )
  })

  it('picks up the latest conversation, then a waiting session, then introduces itself', () => {
    expect(
      resolveTemplateOpening(
        signalsOf({ conversations: [conversation({ id: 'c', title: '周报' })] }),
        fakeT
      )
    ).toBe('home.opening.template.conversation{"title":"周报"}')
    expect(
      resolveTemplateOpening(
        signalsOf({ projects, sessions: [session({ sessionRef: 's', projectId: 'p1' })] }),
        fakeT
      )
    ).toBe('home.opening.template.sessionInProject{"provider":"pi","project":"talex-touch"}')
    expect(
      resolveTemplateOpening(signalsOf({ sessions: [session({ sessionRef: 's' })] }), fakeT)
    ).toBe('home.opening.template.session{"provider":"pi"}')
    expect(resolveTemplateOpening(signalsOf(), fakeT)).toBe('home.opening.template.default')
  })
})

describe('buildHomeOpeningRequest', () => {
  it('pairs the catalog prompt with the summary and a template for the same signals', () => {
    const signals = signalsOf({ conversations: [conversation({ id: 'c', title: '周报' })] })
    const built = buildHomeOpeningRequest(signals, fakeT)

    expect(built.prompt).toBe('home.opening.prompt')
    expect(built.summary).toContain('周报')
    expect(built.fallback).toBe('home.opening.template.conversation{"title":"周报"}')
    expect(buildHomeOpeningRequest(signals, fakeT).fingerprint).toBe(built.fingerprint)
  })
})

describe('createOpeningLeadNote', () => {
  it('wraps the opening in the catalog’s note', () => {
    expect(createOpeningLeadNote(fakeT)('你好')).toBe('home.opening.leadNote{"text":"你好"}')
  })
})
