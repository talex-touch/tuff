// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import {
  voiceApiEvents,
  type VoiceAsrStreamEvent
} from '@talex-touch/utils/transport/sdk/domains/voice'

const transportSendMock = vi.hoisted(() => vi.fn())
const transportOnMock = vi.hoisted(() => vi.fn())
const transportStreamMock = vi.hoisted(() => vi.fn())

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transportSendMock,
    stream: transportStreamMock,
    on: transportOnMock
  })
}))

vi.mock('@talex-touch/tuffex/thinking-orb', () => ({
  TxThinkingOrb: defineComponent({
    name: 'TxThinkingOrb',
    props: {
      size: { type: Number, default: 20 },
      displaySize: { type: Number, default: undefined },
      label: { type: String, default: '' }
    },
    setup(props) {
      return () => h('canvas', { class: 'tx-thinking-orb', 'aria-label': props.label })
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
  streamCallbacks = undefined
  streamRequest = undefined
  streamCancelMock = vi.fn()
  streamStopMock = vi.fn()
  disposePanelOpenMock = vi.fn()
  transportSendMock.mockReset()
  transportOnMock.mockReset()
  transportStreamMock.mockReset()
  transportOnMock.mockReturnValue(disposePanelOpenMock)
  transportSendMock.mockImplementation(async (event: unknown) => {
    if (eventName(event) === AssistantEvents.floatingBall.getRuntimeConfig.toEventName()) {
      return { enabled: true, language: 'en-US' }
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

  it('aborts without finalizing on cancel', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    await wrapper.find('[data-testid="voice-cancel"]').trigger('click')
    await nextTick()

    expect(streamCancelMock).toHaveBeenCalledTimes(1)
    expect(streamStopMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  it('disables both actions while transcribing', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    expect(wrapper.find('[data-testid="voice-cancel"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="voice-confirm"]').attributes('disabled')).toBeUndefined()

    exposed(wrapper).stopVoiceInput()
    await nextTick()

    expect(wrapper.find('[data-testid="voice-cancel"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="voice-confirm"]').attributes('disabled')).toBeDefined()

    wrapper.unmount()
  })

  it('rolls a new orb key per session rather than per state change', async () => {
    const wrapper = await mountVoicePanel()
    const panel = exposed(wrapper)

    panel.startVoiceInput()
    await flushPromises()
    const firstSeq = (wrapper.vm as unknown as { sessionSeq: number }).sessionSeq

    // A state change alone must not re-roll: the orb is bound to the session, not the phase.
    panel.stopVoiceInput()
    await nextTick()
    expect((wrapper.vm as unknown as { sessionSeq: number }).sessionSeq).toBe(firstSeq)

    callbacksOrThrow().onEnd?.()
    await nextTick()
    panel.startVoiceInput()
    await flushPromises()
    expect((wrapper.vm as unknown as { sessionSeq: number }).sessionSeq).not.toBe(firstSeq)

    wrapper.unmount()
  })

  it('expands for a notice and collapses when it clears', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    expect(wrapper.find('.voice-dock').attributes('style')).toContain('width: 200px')

    const notice = wrapper.find('[data-testid="voice-notice"]')
    expect(notice.exists()).toBe(false)

    callbacksOrThrow().onError?.(new Error('We did not catch that, please say it again'))
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-notice"]').exists()).toBe(true)
    expect(wrapper.find('.voice-dock--notice').exists()).toBe(true)
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

  it('emits finished after the notice display window', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    callbacksOrThrow().onError?.(new Error('stream unavailable'))
    await nextTick()

    expect(wrapper.emitted('finished')).toBeUndefined()
    vi.advanceTimersByTime(900)
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
