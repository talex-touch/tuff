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

    const idle = barHeights(wrapper)
    expect(idle).toHaveLength(24)

    const callbacks = callbacksOrThrow()
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
    ['unknown', new Error('socket reset'), 'socket reset', 'voice-dock--danger']
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
    expect(wrapper.find('[data-testid="voice-recover"]').text()).toContain('Retry')

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
    expect(wrapper.find('[data-testid="voice-recover"]').text()).toContain('Undo')

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
