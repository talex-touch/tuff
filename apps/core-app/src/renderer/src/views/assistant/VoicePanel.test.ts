// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- The two components here are test doubles for
   tuffex renderers the panel composes, not components this file owns. */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, getCurrentInstance, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import {
  voiceApiEvents,
  type VoiceAsrStreamEvent
} from '@talex-touch/utils/transport/sdk/domains/voice'

const transportSendMock = vi.hoisted(() => vi.fn())
const transportOnMock = vi.hoisted(() => vi.fn())
const transportStreamMock = vi.hoisted(() => vi.fn())
const orbMounts = vi.hoisted(() => ({
  nextId: 0,
  records: [] as Array<{ key: unknown; state: unknown }>
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transportSendMock,
    stream: transportStreamMock,
    on: transportOnMock
  })
}))

vi.mock('@talex-touch/tuffex/border-beam', () => ({
  TxBorderBeam: defineComponent({
    name: 'TxBorderBeam',
    props: {
      active: { type: Boolean, default: true },
      duration: { type: Number, default: undefined },
      colorVariant: { type: String, default: undefined }
    },
    setup(props) {
      // The real one injects an @property stylesheet, which lands in wrapper.text().
      return () =>
        h('span', {
          class: 'tx-border-beam',
          'data-beam-active': String(props.active),
          'data-beam-variant': props.colorVariant,
          'data-beam-duration': props.duration
        })
    }
  })
}))

vi.mock('@talex-touch/tuffex/thinking-orb', () => ({
  TxThinkingOrb: defineComponent({
    name: 'TxThinkingOrb',
    props: {
      size: { type: Number, default: 20 },
      displaySize: { type: Number, default: undefined },
      label: { type: String, default: '' },
      state: { type: String, default: undefined }
    },
    setup(props) {
      const mountId = orbMounts.nextId++
      orbMounts.records.push({ key: getCurrentInstance()?.vnode.key, state: props.state })
      return () =>
        h('canvas', {
          class: 'tx-thinking-orb',
          'aria-label': props.label,
          'data-orb-mount': mountId,
          'data-orb-state': props.state
        })
    }
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'assistant.voicePanel.voiceTranscribingShort': 'Transcribing…',
        'assistant.voicePanel.voiceTranscribeFailed': 'Voice transcription failed',
        'assistant.voicePanel.voiceWakeDisabled': 'Voice input is disabled',
        'assistant.voicePanel.cancelSession': 'Cancel this session',
        'assistant.voicePanel.cancelled': 'Cancelled',
        'assistant.voicePanel.quotaExhausted': 'AI credits are used up — check Settings',
        'assistant.voicePanel.serviceBusy': 'The service is busy. Try again shortly.',
        'assistant.voicePanel.holdToCancel': 'Hold to cancel',
        'assistant.voicePanel.stillWorking': 'Still transcribing…',
        'assistant.voicePanel.stillWorkingLong': 'Longer than usual — hold Esc to cancel',
        'assistant.voicePanel.recovering': 'Recovering…',
        'assistant.voicePanel.recoverCancelled': 'You cancelled a recording',
        'assistant.voicePanel.recoverFailed': 'The last transcription failed',
        'assistant.voicePanel.recoveryExpired': 'That recording expired — say it again',
        'assistant.voicePanel.undo': 'Undo',
        'assistant.voicePanel.retry': 'Retry',
        'assistant.voicePanel.voiceTranscribeEmpty': 'No speech detected',
        'assistant.voicePanel.capturingDevice': 'Opening the microphone…',
        'assistant.voicePanel.microphoneUnresponsive':
          'The microphone is not responding — check your input device',
        'assistant.voicePanel.microphoneMissing':
          'No microphone available — check your system input device',
        'assistant.voicePanel.microphoneDenied':
          'Microphone access is not granted — allow it in System Settings',
        'assistant.voicePanel.stopAndTranscribe': 'Stop and transcribe'
      })[key] ?? key
  })
}))

import VoicePanel from './VoicePanel.vue'

type StreamCallbacks = {
  onData?: (event: VoiceAsrStreamEvent) => unknown
  onError?: (error: Error) => unknown
  onEnd?: () => unknown
}

type StreamRequest = {
  event: unknown
  payload: unknown
}

let streamCallbacks: StreamCallbacks | undefined
let streamRequest: StreamRequest | undefined
let streamCancelMock: Mock
let streamStopMock: Mock
let disposePanelOpenMock: Mock
let recoveryStatusResult: { available: boolean; kind?: string; expiresInMs?: number }
let retryResult: { text: string; expired?: boolean }

function eventName(event: unknown): string {
  if (
    !event ||
    typeof event !== 'object' ||
    !('toEventName' in event) ||
    typeof event.toEventName !== 'function'
  ) {
    return ''
  }
  return event.toEventName()
}

async function mountVoicePanel() {
  const wrapper = mount(VoicePanel)
  await flushPromises()
  return wrapper
}

function exposed(wrapper: VueWrapper) {
  return wrapper.vm as unknown as {
    openPanel: () => Promise<void>
    startVoiceInput: () => void
    stopVoiceInput: () => void
  }
}

function callbacksOrThrow(): StreamCallbacks {
  if (!streamCallbacks) throw new Error('Voice stream callbacks were not registered')
  return streamCallbacks
}

function barHeights(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('[data-testid="voice-wave"] span')
    .map((bar) => bar.attributes('style') ?? '')
}

beforeEach(() => {
  vi.useFakeTimers()
  orbMounts.nextId = 0
  orbMounts.records.length = 0
  streamCallbacks = undefined
  streamRequest = undefined
  streamCancelMock = vi.fn()
  streamStopMock = vi.fn()
  disposePanelOpenMock = vi.fn()
  recoveryStatusResult = { available: false }
  retryResult = { text: 'recovered words' }
  transportSendMock.mockReset()
  transportOnMock.mockReset()
  transportStreamMock.mockReset()
  transportOnMock.mockReturnValue(disposePanelOpenMock)
  transportSendMock.mockImplementation(async (event: unknown) => {
    if (eventName(event) === AssistantEvents.floatingBall.getRuntimeConfig.toEventName()) {
      return { enabled: true, language: 'en-US' }
    }
    if (eventName(event) === voiceApiEvents.recoveryStatus.toEventName()) {
      return { ok: true, result: recoveryStatusResult }
    }
    if (eventName(event) === voiceApiEvents.retryLastFailure.toEventName()) {
      return { ok: true, result: retryResult }
    }
    throw new Error(`Unexpected transport event: ${eventName(event)}`)
  })
  transportStreamMock.mockImplementation(
    async (event: unknown, payload: unknown, options: StreamCallbacks) => {
      streamRequest = { event, payload }
      streamCallbacks = options
      return { cancel: streamCancelMock, stop: streamStopMock }
    }
  )
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('VoicePanel dock surface', () => {
  it('renders the two actions and no text, and never names the assistant', async () => {
    const wrapper = await mountVoicePanel()

    expect(wrapper.find('.voice-dock').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-cancel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-confirm"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.text().trim()).toBe('')
    expect(wrapper.text()).not.toMatch(/阿洛|aler|等待|wake[- ]?word/i)

    wrapper.unmount()
  })
  it('returns from openPanel before runtime config resolves and still permits starting voice', async () => {
    let resolveConfig!: (config: { enabled: boolean; language: string }) => void
    const configRequest = new Promise<{ enabled: boolean; language: string }>((resolve) => {
      resolveConfig = resolve
    })
    transportSendMock.mockImplementation(async (event: unknown) => {
      if (eventName(event) === AssistantEvents.floatingBall.getRuntimeConfig.toEventName()) {
        return configRequest
      }
      throw new Error(`Unexpected transport event: ${eventName(event)}`)
    })

    const wrapper = mount(VoicePanel)
    await nextTick()

    let panelOpened = false
    const opening = exposed(wrapper)
      .openPanel()
      .then(() => {
        panelOpened = true
      })
    await Promise.resolve()
    await nextTick()

    expect(panelOpened).toBe(true)
    expect(transportSendMock).toHaveBeenCalledWith(
      AssistantEvents.floatingBall.getRuntimeConfig,
      undefined
    )

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    expect(eventName(streamRequest?.event)).toBe(voiceApiEvents.asrStream.toEventName())

    resolveConfig({ enabled: true, language: 'en-US' })
    await opening
    await flushPromises()
    wrapper.unmount()
  })

  // Speaking and thinking have to look different; asserting both halves keeps one from
  // silently taking over the other's phase.
  it('shows the waveform while listening and the orb while transcribing', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    // The meter waits for data: before the first level frame the pill is still preparing.
    callbacksOrThrow().onData?.({ type: 'level', rms: 0.4 })
    await nextTick()

    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-orb"]').exists()).toBe(false)

    exposed(wrapper).stopVoiceInput()
    await nextTick()

    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="voice-orb"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('drives bar heights from level events and freezes when they stop', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    const callbacks = callbacksOrThrow()
    callbacks.onData?.({ type: 'level', rms: 0.05 })
    await nextTick()
    const idle = barHeights(wrapper)
    expect(idle).toHaveLength(24)

    callbacks.onData?.({ type: 'level', rms: 0.5 })
    await nextTick()
    const afterFirst = barHeights(wrapper)
    expect(afterFirst).not.toEqual(idle)

    callbacks.onData?.({ type: 'level', rms: 1 })
    await nextTick()
    const afterSecond = barHeights(wrapper)
    expect(afterSecond).not.toEqual(afterFirst)

    // Negative control: with no level data the meter must sit still rather than animate.
    // Without this, a decorative CSS animation would satisfy every assertion above.
    callbacks.onData?.({ type: 'partial', text: 'hello' })
    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(barHeights(wrapper)).toEqual(afterSecond)

    wrapper.unmount()
  })

  it('opts into level frames on the shared active-app stream', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    expect(eventName(streamRequest?.event)).toBe(voiceApiEvents.asrStream.toEventName())
    expect(streamRequest?.payload).toEqual({
      language: 'en-US',
      cleanup: true,
      delivery: 'active-app',
      emitLevel: true
    })

    wrapper.unmount()
  })
})

describe('VoicePanel session control', () => {
  it('stops instead of cancelling on confirm, and waits for end to finish', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    await wrapper.find('[data-testid="voice-confirm"]').trigger('click')
    await nextTick()

    // Cancelling here would abort the session main-side and drop the transcript.
    expect(streamStopMock).toHaveBeenCalledTimes(1)
    expect(streamCancelMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('finished')).toBeUndefined()

    vi.advanceTimersByTime(5000)
    await nextTick()
    expect(wrapper.emitted('finished')).toBeUndefined()

    callbacksOrThrow().onEnd?.()
    await nextTick()
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  it('aborts without finalizing on cancel, then holds a short cancelled notice', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    await wrapper.find('[data-testid="voice-cancel"]').trigger('click')
    await nextTick()

    expect(streamCancelMock).toHaveBeenCalledTimes(1)
    expect(streamStopMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe('Cancelled')
    expect(wrapper.find('.voice-dock--muted').exists()).toBe(true)

    // Carrying an undo button, so it gets the long hold — a notice you can act on has to
    // outlast the reflex to reach for it.
    expect(wrapper.find('[data-testid="voice-recover"]').exists()).toBe(true)
    vi.advanceTimersByTime(700)
    await nextTick()
    expect(wrapper.emitted('finished')).toBeUndefined()

    vi.advanceTimersByTime(4400)
    await nextTick()
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  // Tap is what people do to dismiss something they were not looking at. Losing a sentence to
  // that is a bad trade, so the tap has to do nothing and only the hold may cancel.
  it('ignores a tapped Escape and cancels only on a held one', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    vi.advanceTimersByTime(200)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
    await nextTick()

    expect(streamCancelMock).not.toHaveBeenCalled()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    vi.advanceTimersByTime(650)
    await flushPromises()

    expect(streamCancelMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe('Cancelled')

    wrapper.unmount()
  })

  it('replaces the confirm action with the orb while transcribing', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    expect(wrapper.find('[data-testid="voice-confirm"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-orb"]').exists()).toBe(false)

    exposed(wrapper).stopVoiceInput()
    await nextTick()

    // The slot cannot hold an action and a progress mark at once — that is the whole point.
    expect(wrapper.find('[data-testid="voice-confirm"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="voice-orb"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-hint"]').text()).toBe('Transcribing…')
    expect(wrapper.find('[data-testid="voice-hint"]').classes()).toContain(
      'voice-dock__text--shimmer'
    )
    // Cancel stays live: Escape has to remain available while the transcript is in flight.
    expect(wrapper.find('[data-testid="voice-cancel"]').attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })

  it.each([
    ['quota', new Error('QUOTA_EXCEEDED'), 'AI credits are used up', 'voice-dock--warning'],
    [
      'high demand',
      new Error('provider overloaded (529)'),
      'service is busy',
      'voice-dock--warning'
    ],
    // Unclassified failures no longer surface the provider's own sentence: it is English,
    // gets truncated by the pill width, and offers nothing to act on.
    ['unknown', new Error('socket reset'), 'Voice transcription failed', 'voice-dock--danger']
  ])('sorts a %s failure into its own tone', async (_label, error, text, toneClass) => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    callbacksOrThrow().onError?.(error)
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').text()).toContain(text)
    expect(wrapper.find(`.${toneClass}`).exists()).toBe(true)

    wrapper.unmount()
  })

  it('expands for a notice and collapses when it clears', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    expect(wrapper.find('.voice-dock').attributes('style')).toContain('width: 200px')

    callbacksOrThrow().onError?.(new Error('We did not catch that, please say it again'))
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(true)
    const width = Number(
      /width:\s*(\d+)px/.exec(wrapper.find('.voice-dock').attributes('style') ?? '')?.[1]
    )
    expect(width).toBeGreaterThanOrEqual(200)
    expect(width).toBeLessThanOrEqual(340)

    await exposed(wrapper).openPanel()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
    expect(wrapper.find('.voice-dock').attributes('style')).toContain('width: 200px')

    wrapper.unmount()
  })

  it('remounts the orb with a fresh key and random state for every session', async () => {
    const wrapper = await mountVoicePanel()
    const panel = exposed(wrapper)

    panel.startVoiceInput()
    await flushPromises()
    panel.stopVoiceInput()
    await nextTick()
    const firstOrb = orbMounts.records.at(-1)

    expect(firstOrb?.state).toBe('random')

    callbacksOrThrow().onEnd?.()
    await nextTick()
    panel.startVoiceInput()
    await flushPromises()
    panel.stopVoiceInput()
    await nextTick()
    const secondOrb = orbMounts.records.at(-1)

    expect(secondOrb?.state).toBe('random')
    expect(secondOrb?.key).not.toBe(firstOrb?.key)

    wrapper.unmount()
  })

  it('emits finished after the notice display window', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    callbacksOrThrow().onError?.(new Error('stream unavailable'))
    await nextTick()

    // A retryable failure carries a button, so it holds for the action window, not 900ms.
    expect(wrapper.find('[data-testid="voice-recover"]').exists()).toBe(true)
    vi.advanceTimersByTime(900)
    await nextTick()
    expect(wrapper.emitted('finished')).toBeUndefined()

    vi.advanceTimersByTime(4200)
    await nextTick()
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  it('cancels the owned stream and removes listeners on unmount', async () => {
    const wrapper = await mountVoicePanel()
    const registeredHandler = transportOnMock.mock.calls[0]?.[1]

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    wrapper.unmount()

    expect(streamCancelMock).toHaveBeenCalledTimes(1)
    expect(registeredHandler).toBeTypeOf('function')
    expect(disposePanelOpenMock).toHaveBeenCalledTimes(1)
  })
})

describe('VoicePanel input meter gain', () => {
  function heightsOf(wrapper: VueWrapper): number[] {
    return wrapper
      .findAll('[data-testid="voice-wave"] span')
      .map((bar) => Number(/height:\s*(\d+)px/.exec(bar.attributes('style') ?? '')?.[1] ?? 0))
  }

  async function feed(wrapper: VueWrapper, rms: number, frames: number): Promise<number[]> {
    const callbacks = callbacksOrThrow()
    for (let frame = 0; frame < frames; frame += 1) callbacks.onData?.({ type: 'level', rms })
    await nextTick()
    return heightsOf(wrapper)
  }

  async function listeningPanel() {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    return wrapper
  }

  // The whole point of the auto-gain: a quiet voice and a loud one both have to be readable,
  // because the raw RMS of ordinary speech is far too small to draw directly.
  it('makes a quiet voice as legible as a loud one', async () => {
    const quiet = await listeningPanel()
    const quietPeak = Math.max(...(await feed(quiet, 0.03, 6)))
    quiet.unmount()

    const loud = await listeningPanel()
    const loudPeak = Math.max(...(await feed(loud, 0.9, 6)))
    loud.unmount()

    expect(quietPeak).toBeGreaterThan(12)
    expect(loudPeak).toBeGreaterThan(12)
    // Neither runs away from the other: 30x the input amplitude, comparable on screen.
    expect(Math.abs(quietPeak - loudPeak)).toBeLessThanOrEqual(8)
  })

  // Negative control, and the one that keeps the gain honest: amplifying a quiet voice must
  // not amplify an empty room. Without the noise gate the meter would dance in silence.
  it('leaves silence flat no matter how much gain the quiet path needs', async () => {
    const wrapper = await listeningPanel()

    const speech = Math.max(...(await feed(wrapper, 0.03, 6)))
    const silence = await feed(wrapper, 0.002, 24)

    expect(speech).toBeGreaterThan(12)
    expect(Math.max(...silence)).toBe(3)

    wrapper.unmount()
  })

  it('recovers from a shout fast enough for the next quiet sentence', async () => {
    const wrapper = await listeningPanel()

    await feed(wrapper, 0.9, 8)
    // The newest bar, not the window maximum: the buffer still holds the shout's own frames.
    const rightAfter = (await feed(wrapper, 0.03, 1)).at(-1) ?? 0
    // ~1.7s of release at 10Hz; asserted as frames so the constant cannot quietly slow down.
    const recovered = (await feed(wrapper, 0.03, 20)).at(-1) ?? 0

    expect(rightAfter).toBeLessThan(12)
    expect(recovered).toBeGreaterThan(12)

    wrapper.unmount()
  })

  it(`starts each session from the floor rather than the last session peak`, async () => {
    const wrapper = await listeningPanel()

    await feed(wrapper, 0.9, 8)
    await exposed(wrapper).openPanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()

    expect(Math.max(...(await feed(wrapper, 0.03, 2)))).toBeGreaterThan(12)

    wrapper.unmount()
  })
})

describe('VoicePanel recovery and pacing', () => {
  async function failedPanel() {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    callbacksOrThrow().onError?.(new Error('socket reset'))
    await flushPromises()
    return wrapper
  }

  it('recovers through the same call whether it was cancelled or failed', async () => {
    const wrapper = await failedPanel()
    // Icon-only now, so the label lives where a screen reader can still reach it.
    expect(wrapper.find('[data-testid="voice-recover"]').attributes('aria-label')).toBe('Retry')

    await wrapper.find('[data-testid="voice-recover"]').trigger('click')
    await flushPromises()

    expect(transportSendMock).toHaveBeenCalledWith(
      voiceApiEvents.retryLastFailure,
      expect.objectContaining({ delivery: 'active-app' })
    )
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  // Expiry is a different sentence from failure: one sends you to say it again, the other to
  // check your connection. Collapsing them would send people to the wrong place.
  it('says the recording expired rather than reporting another failure', async () => {
    retryResult = { text: '', expired: true }
    const wrapper = await failedPanel()

    await wrapper.find('[data-testid="voice-recover"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').text()).toContain('expired')
    expect(wrapper.find('.voice-dock--warning').exists()).toBe(true)
    expect(wrapper.emitted('finished')).toBeUndefined()

    wrapper.unmount()
  })

  it('offers no retry for quota or congestion, because retrying changes nothing', async () => {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    callbacksOrThrow().onError?.(new Error('QUOTA_EXCEEDED'))
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-recover"]').exists()).toBe(false)

    wrapper.unmount()
  })

  // The affordance that makes the retention window reachable once the pill has collapsed.
  it('offers to recover a recording left behind by an earlier session', async () => {
    recoveryStatusResult = { available: true, kind: 'cancelled', expiresInMs: 20_000 }
    const wrapper = await mountVoicePanel()

    await exposed(wrapper).openPanel()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').text()).toContain('cancelled a recording')
    expect(wrapper.find('[data-testid="voice-recover"]').attributes('aria-label')).toBe('Undo')

    wrapper.unmount()
  })

  it('stays quiet when nothing is recoverable', async () => {
    const wrapper = await mountVoicePanel()

    await exposed(wrapper).openPanel()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('escalates the wait in two steps and slows the beam with it', async () => {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    exposed(wrapper).stopVoiceInput()
    await nextTick()

    expect(wrapper.find('[data-testid="voice-hint"]').text()).toBe('Transcribing…')

    vi.advanceTimersByTime(3100)
    await nextTick()
    expect(wrapper.find('[data-testid="voice-hint"]').text()).toContain('Still transcribing')
    expect(wrapper.find('.voice-dock--warning').exists()).toBe(true)

    vi.advanceTimersByTime(5100)
    await nextTick()
    expect(wrapper.find('[data-testid="voice-hint"]').text()).toContain('Longer than usual')
    // The beam reads as pace: the same wait, drawn slower, is what "stuck" looks like.
    expect(
      Number(wrapper.find('.tx-border-beam').attributes('data-beam-duration'))
    ).toBeGreaterThan(3)

    wrapper.unmount()
  })

  it('draws the hold on the border and unwinds it when released', async () => {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(wrapper.find('.voice-dock--holding').exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('.voice-dock--holding').exists()).toBe(false)
    expect(streamCancelMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})

describe('VoicePanel device readiness and long messages', () => {
  async function listeningPanel() {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    return wrapper
  }

  /**
   * Twenty-four bars at minimum height is not an empty pill — it is a working meter reporting
   * silence, which is a claim we cannot make while the device is still opening.
   */
  it('breathes instead of drawing a meter it has no data for', async () => {
    const wrapper = await listeningPanel()

    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(false)
    expect(wrapper.find('.voice-dock--preparing').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-hint"]').text()).toContain('Opening the microphone')

    wrapper.unmount()
  })

  it('hands over to the meter when data arrives, not when a timer says so', async () => {
    const wrapper = await listeningPanel()

    // Well past the give-up threshold in wall time, but no frame has landed yet.
    callbacksOrThrow().onData?.({ type: 'level', rms: 0.3 })
    await nextTick()

    expect(wrapper.find('.voice-dock--preparing').exists()).toBe(false)
    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('stops breathing and says so when the device never answers', async () => {
    const wrapper = await listeningPanel()

    vi.advanceTimersByTime(2100)
    await flushPromises()

    expect(wrapper.find('.voice-dock--preparing').exists()).toBe(false)
    expect(wrapper.find('[data-testid="voice-notice"]').text()).toContain('not responding')
    expect(streamCancelMock).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('keeps breathing while frames keep arriving', async () => {
    const wrapper = await listeningPanel()
    callbacksOrThrow().onData?.({ type: 'level', rms: 0.3 })
    await nextTick()

    // Negative control for the timeout: once data flows, the give-up timer must not fire.
    vi.advanceTimersByTime(3000)
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it.each([
    ['no device', 'CAPTURE_UNAVAILABLE: Cannot find microphone', 'No microphone available'],
    ['denied', 'PERMISSION_DENIED', 'Microphone access is not granted']
  ])('classifies a %s failure instead of quoting the provider', async (_label, raw, expected) => {
    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error(raw))
    await flushPromises()

    const text = wrapper.find('[data-testid="voice-notice"]').text()
    expect(text).toContain(expected)
    expect(text).not.toContain('Cannot find')
    expect(wrapper.find('.voice-dock--warning').exists()).toBe(true)
    // Retrying finds the same missing microphone, so there is nothing to offer.
    expect(wrapper.find('[data-testid="voice-recover"]').exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * jsdom has no layout, so overflow is stubbed on the prototype: the component measures
   * `scrollWidth > clientWidth`, and the point of the test is that the answer drives height.
   */
  it('grows a second line rather than dropping the half that says what to do', async () => {
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(420)
    const clientSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(246)

    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('PERMISSION_DENIED'))
    await flushPromises()
    await flushPromises()

    const style = wrapper.find('.voice-dock').attributes('style') ?? ''
    expect(style).toContain('height: 88px')
    // Width goes to the cap first; only then does the island grow.
    expect(style).toContain('width: 340px')
    // And it stops being a pill: a pill's radius is half its height, so at 88 the ends would
    // swallow the room the second line needs. One line is a pill, two lines is a card.
    expect(style).toContain('border-radius: 24px')
    expect(wrapper.find('.voice-dock--expanded').exists()).toBe(true)
    // The controls grow with the card. Leaving them at the pill's 34 would strand two small
    // circles in a surface twice their height.
    for (const testId of ['voice-cancel', 'voice-confirm']) {
      const control = wrapper.find(`[data-testid="${testId}"]`).attributes('style') ?? ''
      expect(control).toContain('width: 40px')
      expect(control).toContain('height: 40px')
    }
    // A microphone with a line through it names the culprit before the sentence is read.
    expect(wrapper.find('[data-testid="voice-notice-icon"]').classes()).toContain(
      'i-carbon-microphone-off'
    )

    widthSpy.mockRestore()
    clientSpy.mockRestore()
    wrapper.unmount()
  })

  /**
   * The icon is not decoration for "something went wrong" — it is a picture of the microphone.
   * Handing it to every failure would put a microphone next to "out of credit", naming a
   * culprit that is not the one.
   */
  it('draws the microphone icon only when the microphone is the problem', async () => {
    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('QUOTA_EXCEEDED'))
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe(
      'AI credits are used up — check Settings'
    )
    expect(wrapper.find('[data-testid="voice-notice-icon"]').exists()).toBe(false)
    wrapper.unmount()

    // Nor does the fallback, which is where an unrecognised failure lands: we do not know that
    // the microphone had anything to do with it, so we do not draw one.
    const unclassified = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('E_SOMETHING_ELSE'))
    await flushPromises()
    await flushPromises()

    expect(unclassified.find('[data-testid="voice-notice"]').text()).toBe(
      'Voice transcription failed'
    )
    expect(unclassified.find('[data-testid="voice-notice-icon"]').exists()).toBe(false)

    unclassified.unmount()
  })

  it('stays one line high when the message fits', async () => {
    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('PERMISSION_DENIED'))
    await flushPromises()
    await flushPromises()

    const style = wrapper.find('.voice-dock').attributes('style') ?? ''
    expect(style).toContain('height: 44px')
    expect(style).toContain('border-radius: 22px')
    expect(wrapper.find('.voice-dock--expanded').exists()).toBe(false)
    // In the pill the control is the bar: 44 minus its 5px padding on both sides.
    expect(wrapper.find('[data-testid="voice-cancel"]').attributes('style')).toContain(
      'width: 34px'
    )

    wrapper.unmount()
  })
})
