// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import {
  voiceApiEvents,
  type VoiceAsrStreamEvent
} from '@talex-touch/utils/transport/sdk/domains/voice'
import VoicePanel from './VoicePanel.vue'

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

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'assistant.voicePanel.voicePreparing': 'Preparing voice capture',
        'assistant.voicePanel.voiceTranscribing': 'Transcribing voice',
        'assistant.voicePanel.listening': 'Listening',
        'assistant.voicePanel.voiceTranscribed': 'Voice transcribed',
        'assistant.voicePanel.submitFailed': 'Voice delivery failed',
        'assistant.voicePanel.voiceTranscribeFailed': 'Voice transcription failed',
        'assistant.voicePanel.voiceWakeDisabled': 'Voice input is disabled'
      })[key] ?? key
  })
}))

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

beforeEach(() => {
  vi.useFakeTimers()
  streamCallbacks = undefined
  streamRequest = undefined
  streamCancelMock = vi.fn()
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
      return { cancel: streamCancelMock }
    }
  )
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('VoicePanel compact surface', () => {
  it('renders compact status without removed input, action, screenshot, or wake-word controls', async () => {
    const wrapper = await mountVoicePanel()

    expect(wrapper.find('.voice-panel-root').exists()).toBe(true)
    expect(wrapper.find('.voice-panel-status').exists()).toBe(true)
    expect(wrapper.find('.voice-signal').exists()).toBe(true)
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('footer').exists()).toBe(false)
    expect(wrapper.find('.voice-panel-close').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/阿洛|aler|等待|wake[- ]?word/i)

    wrapper.unmount()
  })

  it('resets active/error state on openPanel and keeps the compact status surface', async () => {
    const wrapper = await mountVoicePanel()
    const panel = exposed(wrapper)

    panel.startVoiceInput()
    await flushPromises()
    expect(wrapper.find('.voice-panel--active').exists()).toBe(true)

    const callbacks = streamCallbacks
    if (!callbacks) throw new Error('Voice stream callbacks were not registered')
    await callbacks.onError?.(new Error('stream unavailable'))

    await panel.openPanel()
    await flushPromises()

    expect(wrapper.find('.voice-panel--active').exists()).toBe(false)
    expect(wrapper.find('.voice-panel--error').exists()).toBe(false)
    expect(wrapper.find('.voice-panel-status').exists()).toBe(true)
    expect(wrapper.find('textarea').exists()).toBe(false)

    wrapper.unmount()
  })
})

describe('VoicePanel shared Voice Session', () => {
  it('starts the shared stream with active-app delivery and exposes listening status', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()

    expect(transportStreamMock).toHaveBeenCalledTimes(1)
    expect(eventName(streamRequest?.event)).toBe(voiceApiEvents.asrStream.toEventName())
    expect(streamRequest?.payload).toEqual({
      language: 'en-US',
      cleanup: true,
      delivery: 'active-app'
    })
    expect(wrapper.find('.voice-panel--active').exists()).toBe(true)
    expect(wrapper.find('.voice-panel-status').text()).toBe('Listening')

    wrapper.unmount()
  })

  it('stops the current stream and emits finished exactly once', async () => {
    const wrapper = await mountVoicePanel()
    const panel = exposed(wrapper)

    panel.startVoiceInput()
    await flushPromises()
    expect(transportStreamMock).toHaveBeenCalledTimes(1)
    panel.stopVoiceInput()
    await nextTick()

    expect(streamCancelMock).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('finished')).toHaveLength(1)

    panel.stopVoiceInput()
    await nextTick()
    expect(wrapper.emitted('finished')).toHaveLength(1)

    wrapper.unmount()
  })

  it('emits finished when the shared stream reaches end', async () => {
    const wrapper = await mountVoicePanel()

    exposed(wrapper).startVoiceInput()
    await flushPromises()
    expect(transportStreamMock).toHaveBeenCalledTimes(1)
    const callbacks = streamCallbacks
    if (!callbacks) throw new Error('Voice stream callbacks were not registered')
    await callbacks.onEnd?.()
    await nextTick()

    expect(wrapper.emitted('finished')).toHaveLength(1)
    expect(wrapper.find('.voice-panel--active').exists()).toBe(false)

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
