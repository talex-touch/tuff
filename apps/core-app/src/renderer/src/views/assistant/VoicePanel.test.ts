// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- The two components here are test doubles for
   tuffex renderers the panel composes, not components this file owns. */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { ORB_STATES } from '@talex-touch/tuffex/thinking-orb'
import {
  voiceApiEvents,
  type VoiceAsrStreamEvent
} from '@talex-touch/utils/transport/sdk/domains/voice'

const transportSendMock = vi.hoisted(() => vi.fn())
const transportOnMock = vi.hoisted(() => vi.fn())
const transportStreamMock = vi.hoisted(() => vi.fn())
const transportHandlers = vi.hoisted(() => new Map<string, (payload?: unknown) => unknown>())

vi.mock('~/modules/preload/process-info', () => ({
  getPreloadProcessInfo: () => ({ platform: 'darwin', arch: 'arm64' })
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

vi.mock('@talex-touch/tuffex/thinking-orb', async () => ({
  // The real list, not a copy: the panel's job is to roll through every shape the package
  // publishes, so a hand-written nine here would keep passing after a tenth was added.
  ORB_STATES: (
    await vi.importActual<typeof import('@talex-touch/tuffex/thinking-orb')>(
      '@talex-touch/tuffex/thinking-orb'
    )
  ).ORB_STATES,
  TxThinkingOrb: defineComponent({
    name: 'TxThinkingOrb',
    props: {
      size: { type: Number, default: 20 },
      displaySize: { type: Number, default: undefined },
      label: { type: String, default: '' },
      state: { type: String, default: undefined }
    },
    setup(props) {
      return () =>
        h('canvas', {
          class: 'tx-thinking-orb',
          'aria-label': props.label,
          'data-orb-state': props.state
        })
    }
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    // Mirrors vue-i18n's `t(key, params)` closely enough for the one interpolated string here:
    // a message that renders `{name}` literally would pass an assertion on the key alone.
    t: (key: string, params?: Record<string, unknown>) =>
      Object.entries(params ?? {}).reduce(
        (message, [token, value]) => message.replace(`{${token}}`, String(value)),
        {
          'assistant.voicePanel.voiceTranscribingShort': 'Transcribing…',
          'assistant.voicePanel.voiceTranscribeFailed': 'Voice transcription failed',
          'assistant.voicePanel.voiceInputDisabled': 'Voice input is disabled',
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
          'assistant.voicePanel.voiceListening': 'Listening…',
          'assistant.voicePanel.capturingDevice': 'Opening the microphone…',
          'assistant.voicePanel.usingDevice': 'Switched to {name}',
          'assistant.voicePanel.voiceRecognitionNotConfigured': 'Speech recognition is not set up',
          'assistant.voicePanel.voiceRecognitionUnavailable':
            'Speech recognition channel is unavailable',
          'assistant.voicePanel.openRecognitionSettings': 'Open Intelligence settings',
          'assistant.voicePanel.microphoneUnresponsive': 'The microphone is not responding',
          'assistant.voicePanel.microphoneMissing': 'No microphone available',
          'assistant.voicePanel.microphoneDenied': 'Microphone access not granted',
          'assistant.voicePanel.openMicrophoneSettings': 'Open microphone settings',
          'assistant.voicePanel.microphoneSettingsUnavailable':
            'This system has no microphone settings pane to open',
          'assistant.voicePanel.stopAndTranscribe': 'Stop and transcribe'
        }[key] ?? key
      )
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
let recoveryStatusResult: { available: boolean; kind?: string; expiresInMs?: number }
let retryResult: { text: string; expired?: boolean }

/** How many times the panel told main the held recording is no longer reachable. */
function discardCalls(): number {
  return transportSendMock.mock.calls.filter(
    ([event]) => eventName(event) === voiceApiEvents.discardRecovery.toEventName()
  ).length
}

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
function emitTransport(event: { toEventName: () => string }, payload?: unknown): void {
  transportHandlers.get(event.toEventName())?.(payload)
}

function requestedDeliveryTiming(): string | undefined {
  const payload = streamRequest?.payload
  if (!payload || typeof payload !== 'object' || !('deliveryTiming' in payload)) return undefined
  return typeof payload.deliveryTiming === 'string' ? payload.deliveryTiming : undefined
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
    toggleVoiceInput: () => void
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
  streamCallbacks = undefined
  streamRequest = undefined
  streamCancelMock = vi.fn()
  streamStopMock = vi.fn()
  recoveryStatusResult = { available: false }
  retryResult = { text: 'recovered words' }
  transportHandlers.clear()
  transportSendMock.mockReset()
  transportOnMock.mockReset()
  transportStreamMock.mockReset()
  transportOnMock.mockImplementation(
    (event: { toEventName: () => string }, handler: (payload?: unknown) => unknown) => {
      const eventName = event.toEventName()
      transportHandlers.set(eventName, handler)
      return () => {
        if (transportHandlers.get(eventName) === handler) transportHandlers.delete(eventName)
      }
    }
  )
  transportSendMock.mockImplementation(async (event: unknown) => {
    if (eventName(event) === AssistantEvents.floatingBall.getRuntimeConfig.toEventName()) {
      return { enabled: true, language: 'en-US', polishEnabled: true, polishStrength: 'structured' }
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

/**
 * Mirrors `PILL_MAX_WIDTH` in VoicePanel.vue. The component's constants live inside the
 * SFC, so this cannot import them; naming it here at least makes the next change one edit
 * rather than a hunt for every literal.
 */
const PILL_MAX_WIDTH = 280

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
  it('waits for runtime voice input configuration before starting recognition', async () => {
    let resolveConfig!: (config: {
      enabled: boolean
      language: string
      polishEnabled: boolean
      polishStrength: 'natural' | 'structured' | 'deep'
    }) => void
    const configRequest = new Promise<{
      enabled: boolean
      language: string
      polishEnabled: boolean
      polishStrength: 'natural' | 'structured' | 'deep'
    }>((resolve) => {
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
    exposed(wrapper).startVoiceInput()
    await flushPromises()

    expect(panelOpened).toBe(false)
    expect(transportStreamMock).not.toHaveBeenCalled()

    resolveConfig({
      enabled: true,
      language: 'en-US',
      polishEnabled: true,
      polishStrength: 'structured'
    })
    await opening
    exposed(wrapper).startVoiceInput()
    await flushPromises()

    expect(eventName(streamRequest?.event)).toBe(voiceApiEvents.asrStream.toEventName())
    wrapper.unmount()
  })
  it('does not start recognition when runtime voice input is disabled', async () => {
    transportSendMock.mockImplementation(async (event: unknown) => {
      if (eventName(event) === AssistantEvents.floatingBall.getRuntimeConfig.toEventName()) {
        return { enabled: false, language: 'fr-FR', polishEnabled: true, polishStrength: 'deep' }
      }
      throw new Error(`Unexpected transport event: ${eventName(event)}`)
    })
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    expect(transportStreamMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe('Voice input is disabled')
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

  it('aggregates consecutive partial transcript chunks while retaining the live waveform', async () => {
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

    callbacks.onData?.({ type: 'partial', text: '你好' })
    await nextTick()
    expect(wrapper.find('[data-testid="voice-live-text"]').text()).toBe('你好')

    callbacks.onData?.({ type: 'partial', text: '世界' })
    await nextTick()
    expect(wrapper.find('[data-testid="voice-live-text"]').text()).toBe('你好世界')
    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)

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
      polishStrength: 'structured',
      delivery: 'active-app',
      deliveryTiming: 'final',
      emitLevel: true,
      // The cap the border divides by, sent rather than inherited from main's default.
      maxDurationMs: 300_000
    })

    wrapper.unmount()
  })

  it('uses raw live delivery only when the persisted polish preference is disabled', async () => {
    transportSendMock.mockImplementation(async (event: unknown) => {
      if (eventName(event) === AssistantEvents.floatingBall.getRuntimeConfig.toEventName()) {
        return { enabled: true, language: 'en-US', polishEnabled: false, polishStrength: 'natural' }
      }
      throw new Error(`Unexpected transport event: ${eventName(event)}`)
    })
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    expect(requestedDeliveryTiming()).toBe('live')

    wrapper.unmount()
  })
})

/**
 * The live transcript follows its own tail.
 *
 * jsdom has no layout, so the natural width is stubbed on the prototype exactly as the
 * pill-sizing tests do. What is being pinned is the arithmetic, which is the part that can
 * silently invert: an offset of the wrong sign scrolls the sentence off the far side.
 *
 * The window is `pillWidth - PILL_EDGE_WIDTH - 2 * STREAM_FADE`, i.e. `pillWidth - 40` — the
 * pill's whole content box, because the live row spans all three columns rather than sitting
 * in the centre one — and `pillWidth` is `clamp(natural + 2 + 94, 200, 280)`.
 */
describe('VoicePanel live transcript follow', () => {
  function offset(wrapper: VueWrapper): number {
    const style = wrapper.find('[data-testid="voice-live-text"]').attributes('style') ?? ''
    const match = /translateX\((-?[\d.]+)px\)/.exec(style)
    if (!match) throw new Error(`no translateX in style: ${style}`)
    return Number(match[1])
  }

  async function panelWithNaturalWidth(natural: number): Promise<VueWrapper> {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(natural)
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    callbacksOrThrow().onData?.({ type: 'partial', text: 'anything' })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  // The stub is on the prototype, so leaving it up hands the next describe a paragraph that
  // measures however wide this block's last case happened to need — every pill-sizing spy in
  // this file restores its own for that reason, and this one used to be the exception.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('centres a transcript that fits', async () => {
    // 60 wide in a 200px pill: window is 160, so 50px of slack either side. Centred in the
    // window is centred in the pill, which is what puts the sentence over the meter below it.
    const wrapper = await panelWithNaturalWidth(60)
    expect(offset(wrapper)).toBeCloseTo(50, 5)
    wrapper.unmount()
  })

  it('pins the tail once the transcript overflows', async () => {
    // 400 wide against the 280px cap: window is 240, so the track slides 160 left and the
    // newest character sits at the right edge. A positive number here would push the start
    // of the sentence off screen and show the part nobody is waiting for.
    const wrapper = await panelWithNaturalWidth(400)
    expect(offset(wrapper)).toBeCloseTo(-160, 5)
    wrapper.unmount()
  })

  /**
   * The handover between the two branches has to be silent.
   *
   * They are written as separate cases, so nothing structural stops one from being off by a
   * few pixels at the boundary — which would read as the sentence flinching the moment it
   * outgrows the pill. At exactly the window width both must be nought.
   */
  it('crosses from centred to following without a jump', async () => {
    const wrapper = await panelWithNaturalWidth(240)
    expect(offset(wrapper)).toBeCloseTo(0, 5)
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

    vi.advanceTimersByTime(6400)
    await nextTick()
    expect(wrapper.emitted('finished')).toBeUndefined()

    callbacksOrThrow().onEnd?.()
    await nextTick()
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  it('keeps a warning visible after an empty transcription ends', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    const callbacks = callbacksOrThrow()
    callbacks.onData?.({ type: 'final', text: '' })
    await nextTick()
    callbacks.onEnd?.()
    await nextTick()

    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(true)
    expect(wrapper.find('.voice-dock--warning').exists()).toBe(true)
    expect(wrapper.emitted('finished')).toBeUndefined()

    wrapper.unmount()
  })

  it('finishes exactly once after active-app delivery reaches end', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    const callbacks = callbacksOrThrow()
    callbacks.onData?.({
      type: 'final',
      text: 'delivered words',
      delivery: { method: 'native' }
    })
    await nextTick()
    expect(wrapper.emitted('finished')).toBeUndefined()

    callbacks.onEnd?.()
    await nextTick()

    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
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
    vi.advanceTimersByTime(900)
    await nextTick()
    expect(wrapper.emitted('finished')).toBeUndefined()

    vi.advanceTimersByTime(5700)
    await nextTick()
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  it('cancels only when the main-owned global Escape hold commits', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    emitTransport(AssistantEvents.voice.cancelHold, { state: 'start' })
    emitTransport(AssistantEvents.voice.cancelHold, { state: 'reset' })
    await nextTick()
    expect(streamCancelMock).not.toHaveBeenCalled()

    emitTransport(AssistantEvents.voice.cancelHold, { state: 'start' })
    emitTransport(AssistantEvents.voice.cancelHold, { state: 'commit' })
    await flushPromises()

    expect(streamCancelMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe('Cancelled')
    wrapper.unmount()
  })
  it('starts a fresh session from an error notice without retrying or accepting stale callbacks', async () => {
    const wrapper = await mountVoicePanel()
    const panel = exposed(wrapper)

    panel.startVoiceInput()
    await flushPromises()
    const priorCallbacks = callbacksOrThrow()
    priorCallbacks.onError?.(new Error('socket reset'))
    await flushPromises()
    expect(wrapper.find('[data-testid="voice-recover"]').exists()).toBe(true)

    panel.toggleVoiceInput()
    await flushPromises()
    const currentCallbacks = callbacksOrThrow()
    expect(currentCallbacks).not.toBe(priorCallbacks)
    expect(transportStreamMock).toHaveBeenCalledTimes(2)
    expect(transportSendMock).not.toHaveBeenCalledWith(
      voiceApiEvents.retryLastFailure,
      expect.anything()
    )

    currentCallbacks.onData?.({ type: 'level', rms: 0.4 })
    priorCallbacks.onError?.(new Error('late stream failure'))
    priorCallbacks.onEnd?.()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('starts a fresh session from a cancelled notice instead of recovering old audio', async () => {
    const wrapper = await mountVoicePanel()
    const panel = exposed(wrapper)

    panel.startVoiceInput()
    await flushPromises()
    emitTransport(AssistantEvents.voice.cancelHold, { state: 'commit' })
    await flushPromises()
    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe('Cancelled')

    panel.toggleVoiceInput()
    await flushPromises()

    expect(transportStreamMock).toHaveBeenCalledTimes(2)
    expect(transportSendMock).not.toHaveBeenCalledWith(
      voiceApiEvents.retryLastFailure,
      expect.anything()
    )
    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
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
      'missing ASR credential',
      new Error('VOICE_ASR_CREDENTIAL_UNAVAILABLE'),
      'Speech recognition channel is unavailable',
      'voice-dock--warning'
    ],
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
    expect(width).toBeLessThanOrEqual(PILL_MAX_WIDTH)

    await exposed(wrapper).openPanel()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
    expect(wrapper.find('.voice-dock').attributes('style')).toContain('width: 200px')

    wrapper.unmount()
  })

  /**
   * The mark has to keep turning over while the wait does.
   *
   * `state="random"` rolls once per mount, so one session got one shape for its whole wait — a
   * frozen glyph standing in for something still moving. `Math.random` is pinned to a walking
   * sequence here so "every shape is reachable" is an exact claim rather than a likely one.
   */
  it('rolls the thinking mark through the whole orb family while it waits', async () => {
    const steps = ORB_STATES.length - 1
    let call = 0
    const random = vi.spyOn(Math, 'random').mockImplementation(() => (call++ % steps) / steps)

    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    exposed(wrapper).stopVoiceInput()
    await nextTick()

    const shapeNow = (): string =>
      wrapper.find('[data-testid="voice-orb"]').attributes('data-orb-state') ?? ''
    const seen = [shapeNow()]
    for (let tick = 0; tick < ORB_STATES.length; tick += 1) {
      vi.advanceTimersByTime(1200)
      await nextTick()
      seen.push(shapeNow())
    }

    expect(new Set(seen)).toEqual(new Set(ORB_STATES))
    // Never twice running: a repeat reads as the mark having stopped rather than changed.
    expect(seen.every((shape, index) => index === 0 || shape !== seen[index - 1])).toBe(true)

    // And it stops when the wait does — a loose interval outlives the pill that justified it.
    callbacksOrThrow().onEnd?.()
    await nextTick()
    expect(vi.getTimerCount()).toBe(0)

    random.mockRestore()
    wrapper.unmount()
  })

  it('emits finished after the notice display window', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    callbacksOrThrow().onError?.(new Error('stream unavailable'))
    await nextTick()

    // A retryable failure carries a button, so it holds for the action window, not 1200ms.
    expect(wrapper.find('[data-testid="voice-recover"]').exists()).toBe(true)
    vi.advanceTimersByTime(1200)
    await nextTick()
    expect(wrapper.emitted('finished')).toBeUndefined()

    vi.advanceTimersByTime(5400)
    await nextTick()
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  it('cancels the owned stream and removes listeners on unmount', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    wrapper.unmount()

    expect(streamCancelMock).toHaveBeenCalledTimes(1)
    expect(transportHandlers.size).toBe(0)
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

  /**
   * The held audio is justified by there being a button to press. When that button leaves the
   * screen the justification is gone, so main is told rather than left to time it out — ten
   * megabytes of what the user just said is not something to keep for nobody.
   */
  it('drops the held recording when its undo button leaves the screen', async () => {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()

    emitTransport(AssistantEvents.voice.cancelHold, { state: 'commit' })
    await nextTick()

    expect(wrapper.find('[data-testid="voice-recover"]').exists()).toBe(true)
    expect(discardCalls()).toBe(0)

    // The action window closes and the panel reports itself finished; the dock takes the pill
    // off screen, so whatever it was offering stops being reachable.
    vi.advanceTimersByTime(6600)
    await flushPromises()

    expect(wrapper.emitted('finished')).toHaveLength(1)
    expect(discardCalls()).toBe(1)

    wrapper.unmount()
  })

  it('does not drop the recording the user just asked to reuse', async () => {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()

    emitTransport(AssistantEvents.voice.cancelHold, { state: 'commit' })
    await nextTick()

    await wrapper.find('[data-testid="voice-recover"]').trigger('click')
    await flushPromises()

    // Clearing the notice to show the recovering state looks exactly like the offer expiring.
    // Discarding there would delete the audio the retry is in the middle of using.
    expect(discardCalls()).toBe(0)

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

    vi.advanceTimersByTime(6600)
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

    emitTransport(AssistantEvents.voice.cancelHold, { state: 'start' })
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(wrapper.find('.voice-dock--holding').exists()).toBe(true)

    emitTransport(AssistantEvents.voice.cancelHold, { state: 'reset' })
    await nextTick()
    expect(wrapper.find('.voice-dock--holding').exists()).toBe(false)
    expect(streamCancelMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})

/** Drives the hold the way main does: `start`, then `commit` or `release`. */
function hold(wrapper: VueWrapper, state: 'start' | 'commit' | 'release'): void {
  ;(wrapper.vm as unknown as { handleCancelHold: (value: string) => void }).handleCancelHold(state)
}

describe('VoicePanel device readiness and long messages', () => {
  async function listeningPanel() {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    return wrapper
  }

  /**
   * The live meter is present from session start; before the first level frame it uses its pending
   * presentation rather than disappearing while the microphone opens.
   */
  it('shows a pending waveform while the device is opening', async () => {
    const wrapper = await listeningPanel()

    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-wave"]').classes()).toContain(
      'voice-dock__wave--pending'
    )
    expect(wrapper.find('.voice-dock--preparing').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-live-text"]').text()).toContain(
      'Opening the microphone'
    )

    wrapper.unmount()
  })

  it('switches from opening to listening when native capture is ready', async () => {
    const wrapper = await listeningPanel()

    callbacksOrThrow().onData?.({ type: 'ready' })
    await nextTick()

    expect(wrapper.find('[data-testid="voice-live-text"]').text()).toContain('Listening')

    vi.advanceTimersByTime(2100)
    await flushPromises()
    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
    expect(streamCancelMock).not.toHaveBeenCalled()

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
    ['denied', 'PERMISSION_DENIED', 'Microphone access not granted']
  ])('classifies a %s failure instead of quoting the provider', async (_label, raw, expected) => {
    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error(raw))
    await flushPromises()

    const text = wrapper.find('[data-testid="voice-notice"]').text()
    expect(text).toContain(expected)
    expect(text).not.toContain('Cannot find')
    expect(wrapper.find('.voice-dock--warning').exists()).toBe(true)
    // Retrying finds the same missing microphone. Opening the pane where it is turned on does
    // not, so that — and only that — is what the button offers.
    const action = wrapper.find('[data-testid="voice-recover"]')
    expect(action.exists()).toBe(true)
    expect(action.find('.i-carbon-settings').exists()).toBe(true)
    expect(action.find('.i-carbon-renew').exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * jsdom has no layout, so overflow is stubbed on the prototype: the component measures
   * `scrollWidth > clientWidth`, and the point of the test is that the answer drives height.
   */
  it('grows a second line rather than dropping the half that says what to do', async () => {
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(420)
    // Two clamped lines of caption text: 10 padding + 34 + 4 gap + 40 control = 88.
    const heightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(34)

    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('E_LONG_UNCLASSIFIED'))
    await flushPromises()
    await flushPromises()

    const style = wrapper.find('.voice-dock').attributes('style') ?? ''
    expect(style).toContain('height: 88px')
    // Width goes to the cap first; only then does the island grow.
    expect(style).toContain(`width: ${PILL_MAX_WIDTH}px`)
    // And it stops being a pill: a pill's radius is half its height, so at 88 the ends would
    // swallow the room the second line needs. One line is a pill, two lines is a card.
    expect(style).toContain('border-radius: 24px')
    expect(wrapper.find('.voice-dock--expanded').exists()).toBe(true)
    // The controls grow with the card. Leaving them at the pill's 34 would strand two small
    // circles in a surface twice their height.
    // An unclassified failure is the retryable one, so the trailing slot holds its action.
    for (const testId of ['voice-cancel', 'voice-recover']) {
      const control = wrapper.find(`[data-testid="${testId}"]`).attributes('style') ?? ''
      expect(control).toContain('width: 40px')
      expect(control).toContain('height: 40px')
    }

    widthSpy.mockRestore()
    heightSpy.mockRestore()
    wrapper.unmount()
  })

  /**
   * The sentence arrives as a wave of characters, and the wave has a ceiling.
   *
   * Without one, a long message would still be landing more than a second after the pill opened
   * — the reveal would stop reading as arrival and start reading as lag. The spacing tightens
   * with length instead. The text itself stays one string: the spans are presentation, which is
   * what every other assertion in this file reading `.text()` depends on.
   */
  it('reveals the sentence character by character within a fixed window', async () => {
    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('E_SOMETHING_ELSE'))
    await flushPromises()

    const message = 'Voice transcription failed'
    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe(message)

    const chars = wrapper.findAll('.voice-dock__char')
    expect(chars).toHaveLength(message.length)

    const delays = chars.map((char) =>
      Number(/animation-delay: (\d+)ms/.exec(char.attributes('style') ?? '')?.[1] ?? -1)
    )
    expect(delays[0]).toBe(0)
    expect(delays.every((delay, index) => index === 0 || delay >= delays[index - 1]!)).toBe(true)
    expect(delays.at(-1)).toBeLessThanOrEqual(240)

    wrapper.unmount()
  })

  /**
   * The waiting hint's highlight has to live on the characters.
   *
   * It used to be a gradient clipped to the paragraph's text, and that stopped painting entirely
   * once the reveal gave every character its own `filter`: a filtered inline-block composites
   * separately and leaves the parent's text-clip shape, while the transparent text fill keeps
   * inheriting into it. The pill widened around a sentence rendered in nothing.
   *
   * Scope note: jsdom computes no CSS, so this cannot see the glyphs. What it pins is the
   * mechanism — a second, evenly stepped delay per character — which is the part that vanished.
   * The rendering itself was checked in headless Chrome against the old and new rules.
   */
  it('phases the waiting hint per character so the highlight travels across it', async () => {
    const wrapper = await listeningPanel()
    callbacksOrThrow().onData?.({ type: 'level', rms: 0.4 })
    await nextTick()
    exposed(wrapper).stopVoiceInput()
    vi.advanceTimersByTime(8500)
    await nextTick()

    const hint = wrapper.find('[data-testid="voice-hint"]')
    expect(hint.classes()).toContain('voice-dock__text--shimmer')

    const phases = wrapper
      .findAll('.voice-dock__char')
      .map((char) =>
        Number(
          /animation-delay: [^,]+,\s*(-?\d+)ms/.exec(char.attributes('style') ?? '')?.[1] ?? -1
        )
      )
    expect(phases.length).toBeGreaterThan(2)
    // A constant step, not the reveal's tightening one: the wave crosses a long sentence at the
    // same speed it crosses a short one.
    const step = phases[1]! - phases[0]!
    expect(step).toBeGreaterThan(0)
    expect(phases.every((phase, index) => phase === phases[0]! + index * step)).toBe(true)

    wrapper.unmount()
  })

  /**
   * Device selection is an informational interruption, not a terminal session state: the user
   * needs to know which microphone won without losing the recording already in progress.
   */
  it('keeps dictation running through a device switch and resumes transcript display after its hint', async () => {
    const wrapper = await listeningPanel()
    const callbacks = callbacksOrThrow()

    callbacks.onData?.({ type: 'device', name: 'AirPods Pro' })
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-live-text"]').text()).toBe('Switched to AirPods Pro')
    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-confirm"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
    expect(streamCancelMock).not.toHaveBeenCalled()
    expect(streamStopMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('finished')).toBeUndefined()

    callbacks.onData?.({ type: 'partial', text: 'continue speaking' })
    await nextTick()
    vi.advanceTimersByTime(900)
    await nextTick()

    expect(wrapper.find('[data-testid="voice-live-text"]').text()).toContain('continue speaking')
    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)
    expect(transportStreamMock).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('finished')).toBeUndefined()

    exposed(wrapper).stopVoiceInput()
    await nextTick()
    expect(streamStopMock).toHaveBeenCalledTimes(1)
    expect(streamCancelMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('does not let a prior device-hint timer erase a new session hint', async () => {
    const wrapper = await listeningPanel()
    const panel = exposed(wrapper)
    const priorCallbacks = callbacksOrThrow()

    priorCallbacks.onData?.({ type: 'device', name: 'Studio Microphone' })
    await flushPromises()
    vi.advanceTimersByTime(450)
    priorCallbacks.onEnd?.()
    await flushPromises()

    await panel.openPanel()
    panel.startVoiceInput()
    await flushPromises()
    const currentCallbacks = callbacksOrThrow()
    currentCallbacks.onData?.({ type: 'device', name: 'AirPods Pro' })
    await flushPromises()

    // At t=900 the old timer would fire if it crossed the session boundary.
    vi.advanceTimersByTime(450)
    await nextTick()

    expect(wrapper.find('[data-testid="voice-live-text"]').text()).toBe('Switched to AirPods Pro')
    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  /**
   * The one-line states have to actually get one line.
   *
   * `scrollWidth` is an integer and text is not, so a sentence whose real width is 145.7
   * reports 145 and gets a slot exactly 145 wide — a fraction too narrow, and it wraps. Asserted
   * as an inequality rather than a number: the rule is that the slot is strictly wider than the
   * text it was measured from, which is the only thing the slack is there to guarantee.
   */
  it('gives a one-line terminal notice a slot wider than the text it measured', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.style.whiteSpace === 'nowrap' ? 145 : 106
    })

    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('E_SOMETHING_ELSE'))
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe('Voice transcription failed')

    const style = wrapper.find('.voice-dock').attributes('style') ?? ''
    const width = Number(/width: (\d+)px/.exec(style)?.[1] ?? 0)
    expect(width - 94).toBeGreaterThan(145)
    expect(style).toContain('height: 44px')
    expect(wrapper.find('.voice-dock--expanded').exists()).toBe(false)

    vi.restoreAllMocks()
    wrapper.unmount()
  })

  /**
   * A short sentence still has to widen the pill.
   *
   * `scrollWidth` on a wrapped paragraph reports the width it already has, not the width it wants,
   * and that width came from this measurement — so the pill would sit at its base width with
   * the text wrapped inside it forever. The stub answers differently depending on whether the
   * element is being held to one line, which is the only difference between the two questions.
   */
  it('widens for a sentence that would otherwise wrap inside the base pill', async () => {
    const widthSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.style.whiteSpace === 'nowrap' ? 130 : 106
      })

    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('E_SOMETHING_ELSE'))
    await flushPromises()
    await flushPromises()

    // 130 of text + 2 of rounding slack + 94 of chrome, not the 200 the base pill would keep.
    const style = wrapper.find('.voice-dock').attributes('style') ?? ''
    expect(style).toContain('width: 226px')
    expect(style).toContain('height: 44px')
    // And the measurement leaves no trace on the element it borrowed.
    expect(wrapper.find('[data-testid="voice-notice"]').attributes('style') ?? '').not.toContain(
      'nowrap'
    )

    widthSpy.mockRestore()
    wrapper.unmount()
  })

  /**
   * The card hands the text the full width the pill's middle column could not give it, so a
   * message that needed two lines in the pill often needs only one here. Sizing the card for
   * two lines regardless is the same empty band the bottom row had, turned on its side.
   */
  it('sizes the card to the text it ended up with, not to the worst case', async () => {
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(420)
    // One line once the text spans the card: 10 padding + 17 + 4 gap + 40 control = 71.
    const heightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(17)

    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('E_LONG_UNCLASSIFIED'))
    await flushPromises()
    await flushPromises()

    const style = wrapper.find('.voice-dock').attributes('style') ?? ''
    expect(style).toContain('height: 71px')
    expect(wrapper.find('.voice-dock--expanded').exists()).toBe(true)

    widthSpy.mockRestore()
    heightSpy.mockRestore()
    wrapper.unmount()
  })

  /**
   * A long terminal notice is capped at the dock maximum while keeping its complete user-facing
   * text in the rendered notice surface.
   */
  it('sizes the terminal notice from its content', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      if (!this.classList.contains('voice-dock__text')) return 0
      return this.textContent?.includes('busy') ? 246 : 40
    })

    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('SERVICE_IS_busy_RIGHT_NOW'))
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe(
      'The service is busy. Try again shortly.'
    )
    const style = wrapper.find('.voice-dock').attributes('style') ?? ''
    const height = Number(/height: (\d+)px/.exec(style)?.[1] ?? 0)
    expect(style).toContain(`width: ${PILL_MAX_WIDTH}px`)
    expect(height).toBeGreaterThan(44)
    expect(wrapper.find('.voice-dock--expanded').exists()).toBe(true)

    vi.restoreAllMocks()
    wrapper.unmount()
  })

  /**
   * A configuration failure gets the same treatment as a device one, for the same reason: its
   * sentence used to carry the instruction ("请在智能设置中配置 ASR 路由"), which is a sentence too
   * long to read at pill size and long enough to break the card holding it. Icon says which kind
   * of problem, sentence says which problem, button does it.
   */
  it.each([
    ['VOICE_ASR_NOT_CONFIGURED', 'Speech recognition is not set up'],
    // The sibling branch, left behind the first time and reported from a real build.
    ['VOICE_ASR_PROVIDER_UNAVAILABLE', 'Speech recognition channel is unavailable']
  ])('turns %s into a card with a way out', async (code, expected) => {
    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error(code))
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe(expected)
    expect(wrapper.find('.voice-dock--icon-card').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-notice-icon"]').classes()).toContain(
      'i-carbon-settings-adjust'
    )

    const action = wrapper.find('[data-testid="voice-recover"]')
    expect(action.exists()).toBe(true)
    await action.trigger('click')
    await flushPromises()

    expect(
      transportSendMock.mock.calls.some(
        ([event]) =>
          eventName(event) === AssistantEvents.voice.openIntelligenceSettings.toEventName()
      )
    ).toBe(true)

    wrapper.unmount()
  })

  /**
   * The beam says something is charging; it cannot say how much longer, because a ring looks the
   * same at 10% as at 90%. The bar fills 0% → 100% behind the content, so the surface being
   * covered *is* the progress — and releasing early takes it back rather than leaving a stub.
   */
  it('fills a width behind the content while Escape is held, and clears it on release', async () => {
    const wrapper = await listeningPanel()
    expect(wrapper.find('[data-testid="voice-charge"]').exists()).toBe(false)

    // Main owns the key now and reports the hold over the transport, so the panel is driven
    // through the same handle the dock uses rather than through a synthetic keydown.
    hold(wrapper, 'start')
    vi.advanceTimersByTime(150)
    await nextTick()

    const quarter = wrapper.find('[data-testid="voice-charge"]')
    expect(quarter.exists()).toBe(true)
    const started = Number(/width: ([\d.]+)%/.exec(quarter.attributes('style') ?? '')?.[1] ?? -1)
    expect(started).toBeLessThan(100)
    expect(started).toBeGreaterThan(0)

    // The surface tightens with the bar: one gesture, not two effects. A fixed step was three
    // percent, which is present in the DOM and invisible on a capped-width card.
    const scaleAt = (): number => {
      const style = wrapper.find('.voice-dock').attributes('style') ?? ''
      return Number(/scale\(([\d.]+)\)/.exec(style)?.[1] ?? -1)
    }
    const earlyScale = scaleAt()
    expect(earlyScale).toBeLessThan(1)

    vi.advanceTimersByTime(300)
    await nextTick()
    expect(scaleAt()).toBeLessThan(earlyScale)
    const later = Number(
      /width: ([\d.]+)%/.exec(
        wrapper.find('[data-testid="voice-charge"]').attributes('style') ?? ''
      )?.[1] ?? -1
    )
    expect(later).toBeGreaterThan(started)

    // Released before the hold completes: the charge unwinds and nothing is cancelled.
    hold(wrapper, 'release')
    await nextTick()
    expect(wrapper.find('[data-testid="voice-charge"]').exists()).toBe(false)
    expect(wrapper.find('.voice-dock').attributes('style')).not.toContain('scale(')
    // Still the same session: no notice, and the cancel control is still live. The waveform stays
    // visible in its pending presentation until the first level frame arrives.
    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="voice-cancel"]').attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })

  /**
   * The device card is the one that leads with a picture, so it stops being a line of text with
   * an icon in front and becomes a stack: microphone on top, one short sentence under it, the
   * two controls on the floor. Its geometry is fixed because its copy is — there is nothing to
   * measure and nothing that can overflow.
   */
  it('stacks the device failure and offers the settings pane instead of a dead checkmark', async () => {
    const wrapper = await listeningPanel()
    callbacksOrThrow().onError?.(new Error('PERMISSION_DENIED'))
    await flushPromises()
    await flushPromises()

    const style = wrapper.find('.voice-dock').attributes('style') ?? ''
    expect(style).toContain('width: 264px')
    expect(style).toContain('height: 124px')
    expect(wrapper.find('.voice-dock--icon-card').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-notice-icon"]').classes()).toContain(
      'i-carbon-microphone-off'
    )
    // The sentence no longer carries "go to Settings" — the button does.
    expect(wrapper.find('[data-testid="voice-notice"]').text()).toBe(
      'Microphone access not granted'
    )

    const action = wrapper.find('[data-testid="voice-recover"]')
    expect(action.exists()).toBe(true)
    expect(action.find('.i-carbon-settings').exists()).toBe(true)

    await action.trigger('click')
    await flushPromises()
    expect(
      transportSendMock.mock.calls.some(
        ([event]) => eventName(event) === voiceApiEvents.openMicrophoneSettings.toEventName()
      )
    ).toBe(true)

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
    callbacksOrThrow().onError?.(new Error('E_LONG_UNCLASSIFIED'))
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
describe('VoicePanel stream generation boundaries', () => {
  it('stops an unresolved stream as soon as its handle arrives after the user releases', async () => {
    const { promise, resolve } = Promise.withResolvers<{ cancel: () => void; stop: () => void }>()
    const cancel = vi.fn()
    const stop = vi.fn()
    transportStreamMock.mockImplementationOnce(
      async (_event: unknown, _payload: unknown, options: StreamCallbacks) => {
        streamCallbacks = options
        return promise
      }
    )
    const wrapper = await mountVoicePanel()
    const panel = exposed(wrapper)

    panel.startVoiceInput()
    await Promise.resolve()
    panel.stopVoiceInput()
    expect(cancel).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()

    resolve({ cancel, stop })
    await flushPromises()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(cancel).not.toHaveBeenCalled()

    wrapper.unmount()
  })
  it('keeps a reopened session listening when a terminal callback from its prior stream arrives late', async () => {
    const wrapper = await mountVoicePanel()
    const panel = exposed(wrapper)

    panel.startVoiceInput()
    await flushPromises()
    const priorCallbacks = callbacksOrThrow()
    priorCallbacks.onEnd?.()
    await nextTick()
    expect(wrapper.emitted('finished')).toHaveLength(1)

    await panel.openPanel()
    panel.startVoiceInput()
    await flushPromises()
    const currentCallbacks = callbacksOrThrow()
    currentCallbacks.onData?.({ type: 'level', rms: 0.4 })
    await nextTick()
    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)

    // The old transport can still settle after its terminal event. It must not replace the
    // current recording with an error/finished state.
    priorCallbacks.onError?.(new Error('late stream failure'))
    priorCallbacks.onEnd?.()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-wave"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(false)
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  it('retains an actionable error notice when transport end follows the error', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    const callbacks = callbacksOrThrow()
    callbacks.onError?.(new Error('stream unavailable'))
    await flushPromises()
    expect(wrapper.find('[data-testid="voice-recover"]').exists()).toBe(true)

    callbacks.onEnd?.()
    await nextTick()
    expect(wrapper.emitted('finished')).toBeUndefined()

    vi.advanceTimersByTime(6600)
    await nextTick()
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })
})

describe('VoicePanel recording budget', () => {
  async function recordingPanel(): Promise<VueWrapper> {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    // The clock starts on the first level frame, not on the request: opening a device can take
    // seconds, and none of that time is recording.
    callbacksOrThrow().onData?.({ type: 'level', rms: 0.4 })
    await nextTick()
    return wrapper
  }

  /** The fraction actually drawn, read off the two attributes that draw it. */
  function spent(wrapper: VueWrapper): number {
    const rect = wrapper.find('[data-testid="voice-budget"] rect')
    const length = Number(rect.attributes('stroke-dasharray'))
    const offset = Number(rect.attributes('stroke-dashoffset'))
    return (length - offset) / length
  }

  function beamOn(wrapper: VueWrapper): boolean {
    return wrapper.find('.tx-border-beam').attributes('data-beam-active') === 'true'
  }

  /**
   * The denominator has to come from this side. Leaning on main's default would make the line a
   * fraction of a number the renderer never saw, which is the kind of drift that only shows up
   * as a border that finishes early.
   */
  it('asks main for the same cap the border divides by', async () => {
    const wrapper = await recordingPanel()

    expect((streamRequest?.payload as { maxDurationMs?: number })?.maxDurationMs).toBe(300_000)

    wrapper.unmount()
  })

  /** Listening long enough that the cap is news, which is the only time the line is drawn. */
  async function endingPanel(): Promise<VueWrapper> {
    const wrapper = await recordingPanel()
    vi.advanceTimersByTime(280_000)
    await nextTick()
    return wrapper
  }

  /**
   * Who owns the 1px border, in the order a session walks through it.
   *
   * The rule is still "one claim at a time"; what changed is which claim wins in the middle.
   * The budget used to take the edge for the whole five minutes, so the beam — the thing that
   * says "this is live" — was the one state it never appeared in. For all but the last half
   * minute the line is a fact about a ceiling nobody is near, not news.
   */
  it('gives the border to the beam while listening, and to the budget only near the cap', async () => {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()

    // Still opening the device. Nothing is running yet, so nothing claims the edge: the pill
    // is already saying "preparing" by breathing, and a beam on top would claim a live session
    // half a second early.
    expect(wrapper.find('[data-testid="voice-budget"]').exists()).toBe(false)
    expect(beamOn(wrapper)).toBe(false)

    callbacksOrThrow().onData?.({ type: 'level', rms: 0.4 })
    await nextTick()
    expect(beamOn(wrapper)).toBe(true)
    expect(wrapper.find('[data-testid="voice-budget"]').exists()).toBe(false)

    // The last half minute is where the ceiling becomes news and takes the edge back.
    vi.advanceTimersByTime(280_000)
    await nextTick()
    expect(wrapper.find('[data-testid="voice-budget"]').exists()).toBe(true)
    expect(beamOn(wrapper)).toBe(false)

    exposed(wrapper).stopVoiceInput()
    await nextTick()
    expect(wrapper.find('[data-testid="voice-budget"]').exists()).toBe(false)
    expect(beamOn(wrapper)).toBe(true)

    wrapper.unmount()
  })

  it('advances the line with the recording, and starts the next one from zero', async () => {
    const wrapper = await endingPanel()
    // 280s of a 300s cap. The fraction has been accumulating since the first level frame,
    // even though the line only started drawing it in the last half minute.
    expect(spent(wrapper)).toBeCloseTo(280 / 300, 3)

    vi.advanceTimersByTime(10_000)
    await nextTick()
    expect(spent(wrapper)).toBeCloseTo(290 / 300, 3)

    // Negative control: the next recording starts its own budget. Carrying the previous
    // session's elapsed time over would show a line already spent on a microphone that has
    // just been opened.
    callbacksOrThrow().onEnd?.()
    await nextTick()
    // And the clock itself is gone, not merely hidden: a one-second interval left running behind
    // a finished session is invisible in the DOM and still there in the process.
    expect(vi.getTimerCount()).toBe(0)

    await exposed(wrapper).openPanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    callbacksOrThrow().onData?.({ type: 'level', rms: 0.4 })
    await nextTick()
    // A fresh session is nowhere near the cap, so there is no line at all — which is itself
    // the assertion that the elapsed time did not carry over.
    expect(wrapper.find('[data-testid="voice-budget"]').exists()).toBe(false)
    vi.advanceTimersByTime(280_000)
    await nextTick()
    expect(spent(wrapper)).toBeCloseTo(280 / 300, 3)

    wrapper.unmount()
  })

  /**
   * Five minutes is a ceiling nobody reaches, so for almost the whole recording there is nothing
   * to say. The line appears only once the remaining budget is short enough that the recording
   * is about to be stopped for the user — and it appears already in its warning tone, because
   * that is the only condition under which it is drawn.
   */
  it('draws nothing until the last half-minute, then draws it as a warning', async () => {
    const wrapper = await recordingPanel()

    vi.advanceTimersByTime(269_000)
    await nextTick()
    expect(wrapper.find('[data-testid="voice-budget"]').exists()).toBe(false)

    vi.advanceTimersByTime(2_000)
    await nextTick()
    const budget = wrapper.find('[data-testid="voice-budget"]')
    expect(budget.exists()).toBe(true)
    expect(budget.classes()).toContain('voice-dock__budget--ending')

    wrapper.unmount()
  })

  /** A notice and an Escape hold each own the border for something more urgent than a ceiling. */
  it('yields the border to a hold and to a notice', async () => {
    const wrapper = await endingPanel()
    expect(wrapper.find('[data-testid="voice-budget"]').exists()).toBe(true)

    hold(wrapper, 'start')
    vi.advanceTimersByTime(150)
    await nextTick()
    expect(wrapper.find('[data-testid="voice-budget"]').exists()).toBe(false)

    hold(wrapper, 'release')
    await nextTick()
    expect(wrapper.find('[data-testid="voice-budget"]').exists()).toBe(true)

    callbacksOrThrow().onError?.(new Error('stream unavailable'))
    await flushPromises()
    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-budget"]').exists()).toBe(false)

    wrapper.unmount()
  })
})

describe('VoicePanel send progress', () => {
  /** The bar's width, as a fraction. */
  function sent(wrapper: VueWrapper): number {
    const style = wrapper.find('[data-testid="voice-upload"]').attributes('style') ?? ''
    return Number(/width: ([\d.]+)%/.exec(style)?.[1] ?? -1) / 100
  }

  async function sendingPanel(audioSeconds = 0): Promise<VueWrapper> {
    const wrapper = await mountVoicePanel()
    exposed(wrapper).startVoiceInput()
    await flushPromises()
    callbacksOrThrow().onData?.({ type: 'level', rms: 0.4 })
    await nextTick()
    if (audioSeconds > 0) {
      vi.advanceTimersByTime(audioSeconds * 1000)
      await nextTick()
    }
    exposed(wrapper).stopVoiceInput()
    await nextTick()
    return wrapper
  }

  it('fills while the transcript is in flight and stops one percent short', async () => {
    const wrapper = await sendingPanel()
    expect(sent(wrapper)).toBeCloseTo(0, 2)

    vi.advanceTimersByTime(450)
    await nextTick()
    const half = sent(wrapper)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(0.99)

    // Long past the estimate: it parks rather than completing. The step it cannot see — the
    // provider actually transcribing — has no end, and 100% would say the work was done.
    vi.advanceTimersByTime(30_000)
    await nextTick()
    expect(sent(wrapper)).toBeCloseTo(0.99, 3)

    wrapper.unmount()
  })

  /**
   * The estimate is not a measurement, but its shape is defensible: a longer recording is a
   * bigger request. If the pace ignored that, a one-second clip and a one-minute one would report
   * the same progress at the same moment, and one of them would be badly wrong.
   *
   * Measured one panel at a time. Two mounted at once share the fake clock, so setting up the
   * long one runs the short one's bar to its park — after which `short > long` holds no matter
   * what the pace does, and the test passes on the very bug it is named after.
   */
  async function progressAfter(audioSeconds: number, waitMs: number): Promise<number> {
    const wrapper = await sendingPanel(audioSeconds)
    vi.advanceTimersByTime(waitMs)
    await nextTick()
    const value = sent(wrapper)
    wrapper.unmount()
    return value
  }

  it('paces itself against how much audio there is', async () => {
    const short = await progressAfter(1, 600)
    const long = await progressAfter(60, 600)

    expect(short).toBeGreaterThan(long)
    // Not merely slower: a minute of audio is still nowhere near parking after 600ms.
    expect(long).toBeLessThan(0.5)
  })

  /**
   * The one fact on this path. Everything before the provider answers is a projection; the first
   * word back proves the audio landed, so the bar stops projecting and holds there.
   */
  it('parks early the moment the provider answers', async () => {
    const wrapper = await sendingPanel(60)

    vi.advanceTimersByTime(300)
    await nextTick()
    expect(sent(wrapper)).toBeLessThan(0.5)

    callbacksOrThrow().onData?.({ type: 'partial', text: 'hello' })
    await nextTick()
    expect(sent(wrapper)).toBeCloseTo(0.99, 3)

    // Parked means parked: no further advance, and nothing left ticking for it.
    vi.advanceTimersByTime(10_000)
    await nextTick()
    expect(sent(wrapper)).toBeCloseTo(0.99, 3)

    wrapper.unmount()
  })

  it('yields the surface to a hold and to a notice, and clears when the session ends', async () => {
    const wrapper = await sendingPanel()
    expect(wrapper.find('[data-testid="voice-upload"]').exists()).toBe(true)

    hold(wrapper, 'start')
    vi.advanceTimersByTime(150)
    await nextTick()
    expect(wrapper.find('[data-testid="voice-upload"]').exists()).toBe(false)

    hold(wrapper, 'release')
    await nextTick()
    expect(wrapper.find('[data-testid="voice-upload"]').exists()).toBe(true)

    callbacksOrThrow().onError?.(new Error('stream unavailable'))
    await flushPromises()
    expect(wrapper.find('[data-testid="voice-upload"]').exists()).toBe(false)

    wrapper.unmount()
  })
})
