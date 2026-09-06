// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- Child components are isolated test doubles for
   the dock contract. */
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'

const transportOnMock = vi.hoisted(() => vi.fn())
const panelOpenMock = vi.hoisted(() => vi.fn())

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
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
    setup(_props, { expose, emit }) {
      expose({ openPanel: panelOpenMock })
      return () =>
        h('div', {
          class: 'voice-panel-root',
          onClick: () => emit('completed')
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

describe('VoiceDock renderer contract', () => {
  beforeEach(() => {
    handlers.clear()
    panelOpenMock.mockReset()
    transportOnMock.mockReset()
    transportOnMock.mockImplementation(
      (event: { toEventName: () => string }, handler: TransportHandler) => {
        const eventName = event.toEventName()
        handlers.set(eventName, handler)
        return () => {
          if (handlers.get(eventName) === handler) {
            handlers.delete(eventName)
          }
        }
      }
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('switches from compact FloatingBall to managed VoicePanel on panelOpened', async () => {
    const wrapper = mount(VoiceDock)

    expect(wrapper.find('.floating-ball-root').exists()).toBe(true)
    expect(wrapper.find('.voice-panel-root').exists()).toBe(false)

    emit(AssistantEvents.voice.panelOpened, { source: 'wake-word' })
    await nextTick()
    await nextTick()

    expect(wrapper.find('.floating-ball-root').exists()).toBe(false)
    const panel = wrapper.findComponent({ name: 'VoicePanel' })
    expect(panel.exists()).toBe(true)
    expect(panel.props('managedByDock')).toBe(true)
    expect(panelOpenMock).toHaveBeenCalledWith('wake-word')
  })

  it('returns to compact FloatingBall on panelClosed without reopening the panel', async () => {
    const wrapper = mount(VoiceDock)
    emit(AssistantEvents.voice.panelOpened, { source: 'click' })
    await nextTick()
    await nextTick()
    panelOpenMock.mockClear()

    emit(AssistantEvents.voice.panelClosed)
    await nextTick()

    expect(wrapper.find('.floating-ball-root').exists()).toBe(true)
    expect(wrapper.find('.voice-panel-root').exists()).toBe(false)
    expect(panelOpenMock).not.toHaveBeenCalled()
  })

  it('shows an aria-hidden confetti canvas after a completed VoicePanel action', async () => {
    const requestAnimationFrameMock = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      setTransform: vi.fn()
    } as never)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }) as MediaQueryList)
    )

    const wrapper = mount(VoiceDock)
    emit(AssistantEvents.voice.panelOpened, { source: 'click' })
    await nextTick()
    await nextTick()

    await wrapper.find('.voice-panel-root').trigger('click')
    await nextTick()
    await nextTick()

    const canvas = wrapper.find('canvas.voice-dock-confetti')
    expect(canvas.exists()).toBe(true)
    expect(canvas.attributes('aria-hidden')).toBe('true')
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1)
  })

  it('does not start confetti animation when reduced motion is requested', async () => {
    const requestAnimationFrameMock = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }) as MediaQueryList)
    )

    const wrapper = mount(VoiceDock)
    emit(AssistantEvents.voice.panelOpened, { source: 'click' })
    await nextTick()
    await nextTick()

    await wrapper.find('.voice-panel-root').trigger('click')
    await nextTick()

    expect(wrapper.find('canvas.voice-dock-confetti').exists()).toBe(false)
    expect(requestAnimationFrameMock).not.toHaveBeenCalled()
  })

  it('stops reacting after unmount instead of retaining transport-driven state', async () => {
    const wrapper = mount(VoiceDock)
    const openedEventName = AssistantEvents.voice.panelOpened.toEventName()
    const closedEventName = AssistantEvents.voice.panelClosed.toEventName()
    expect(handlers.has(openedEventName)).toBe(true)
    expect(handlers.has(closedEventName)).toBe(true)

    wrapper.unmount()

    expect(handlers.has(openedEventName)).toBe(false)
    expect(handlers.has(closedEventName)).toBe(false)
    emit(AssistantEvents.voice.panelOpened, { source: 'click' })
    await nextTick()

    expect(panelOpenMock).not.toHaveBeenCalled()
  })
})
