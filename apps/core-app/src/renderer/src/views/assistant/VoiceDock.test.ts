// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- Child components are isolated test doubles for
   the dock contract. */
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'

const transportOnMock = vi.hoisted(() => vi.fn())
const transportSendMock = vi.hoisted(() => vi.fn())
const panelOpenMock = vi.hoisted(() => vi.fn())
const panelStartMock = vi.hoisted(() => vi.fn())
const panelStopMock = vi.hoisted(() => vi.fn())

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transportSendMock,
    on: transportOnMock
  })
}))

vi.mock('./FloatingBall.vue', () => ({
  default: defineComponent({
    name: 'FloatingBall',
    setup() {
      return () => h('div', { class: 'floating-ball-root' })
    }
  })
}))

vi.mock('./VoicePanel.vue', () => ({
  default: defineComponent({
    name: 'VoicePanel',
    props: {
      managedByDock: Boolean
    },
    emits: ['finished'],
    setup(_props, { expose, emit }) {
      expose({
        openPanel: panelOpenMock,
        startVoiceInput: panelStartMock,
        stopVoiceInput: panelStopMock
      })
      return () =>
        h('div', {
          class: 'voice-panel-root',
          onClick: () => emit('finished')
        })
    }
  })
}))

import VoiceDock from './VoiceDock.vue'

type TransportHandler = (payload?: unknown) => unknown

const handlers = new Map<string, TransportHandler>()

function emit(event: { toEventName: () => string }, payload?: unknown): void {
  handlers.get(event.toEventName())?.(payload)
}

async function openPanel(source = 'click') {
  emit(AssistantEvents.voice.panelOpened, { source })
  await nextTick()
  await nextTick()
}

describe('VoiceDock renderer contract', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    handlers.clear()
    panelOpenMock.mockReset()
    panelStartMock.mockReset()
    panelStopMock.mockReset()
    transportSendMock.mockReset()
    transportSendMock.mockResolvedValue(undefined)
    transportOnMock.mockImplementation(
      (event: { toEventName: () => string }, handler: TransportHandler) => {
        const eventName = event.toEventName()
        handlers.set(eventName, handler)
        return () => {
          if (handlers.get(eventName) === handler) handlers.delete(eventName)
        }
      }
    )
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('shows only the floating ball initially and hands panelOpened to the VoicePanel handle', async () => {
    const wrapper = mount(VoiceDock)

    expect(wrapper.find('.floating-ball-root').exists()).toBe(true)
    expect(wrapper.find('.voice-panel-root').exists()).toBe(false)

    await openPanel('wake-word')

    expect(wrapper.find('.floating-ball-root').exists()).toBe(false)
    const panel = wrapper.findComponent({ name: 'VoicePanel' })
    expect(panel.exists()).toBe(true)
    expect(panel.props('managedByDock')).toBe(true)
    expect(panelOpenMock).toHaveBeenCalledWith('wake-word')
  })

  it.each([
    { action: 'start' as const, expected: panelStartMock },
    { action: 'stop' as const, expected: panelStopMock }
  ])(
    'routes a Command voice $action to the managed VoicePanel handle',
    async ({ action, expected }) => {
      const wrapper = mount(VoiceDock)
      await openPanel()
      panelStartMock.mockClear()
      panelStopMock.mockClear()

      emit(AssistantEvents.voice.command, { action, mode: 'toggle', source: 'command' })
      await nextTick()
      await nextTick()

      expect(expected).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    }
  )

  it('returns straight to the floating ball once the VoicePanel finishes', async () => {
    const wrapper = mount(VoiceDock)
    await openPanel()

    await wrapper.findComponent({ name: 'VoicePanel' }).vm.$emit('finished')
    await nextTick()

    // The wait for the transcript is expressed inside the pill now, so there is no
    // separate spinner phase left between the panel and the ball.
    expect(wrapper.find('.voice-panel-root').exists()).toBe(false)
    expect(wrapper.find('.voice-dock-processing').exists()).toBe(false)
    expect(wrapper.find('.floating-ball-root').exists()).toBe(true)
    expect(transportSendMock).toHaveBeenCalledWith(AssistantEvents.voice.closePanel, undefined)

    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(wrapper.find('.floating-ball-root').exists()).toBe(true)

    wrapper.unmount()
  })

  it('drops its transport listeners when the dock is unmounted', async () => {
    const wrapper = mount(VoiceDock)
    await openPanel()
    await wrapper.findComponent({ name: 'VoicePanel' }).vm.$emit('finished')
    await nextTick()

    wrapper.unmount()
    vi.advanceTimersByTime(520)

    expect(handlers.size).toBe(0)
  })
})
