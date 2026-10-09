// @vitest-environment jsdom

import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'

const transportOnMock = vi.hoisted(() => vi.fn())
const transportSendMock = vi.hoisted(() => vi.fn())
const panelOpenMock = vi.hoisted(() => vi.fn())
const panelStartMock = vi.hoisted(() => vi.fn())
const panelStopMock = vi.hoisted(() => vi.fn())
const panelCancelHoldMock = vi.hoisted(() => vi.fn())
const panelToggleMock = vi.hoisted(() => vi.fn())

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transportSendMock,
    on: transportOnMock
  })
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
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
        stopVoiceInput: panelStopMock,
        toggleVoiceInput: panelToggleMock,
        handleCancelHold: panelCancelHoldMock
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

/**
 * Opens a session while the previous pill is still leaving — Fn pressed again inside the last
 * pill's leave. Only the real `<Transition>` shows what happens next.
 */
async function reopenWhileLastPillLeaves(wrapper: VueWrapper, source: string): Promise<void> {
  await openPanel()
  vi.advanceTimersByTime(400)
  await flushPromises()
  await wrapper.findComponent({ name: 'VoicePanel' }).vm.$emit('finished')
  await nextTick()
  panelOpenMock.mockClear()
  panelStartMock.mockClear()
  panelCancelHoldMock.mockClear()

  emit(AssistantEvents.voice.panelOpened, { source })
  await nextTick()
}

/** Between sessions the dock holds only its empty placeholder: nothing to see, nothing to click. */
function expectIdle(wrapper: VueWrapper): void {
  expect(wrapper.find('.voice-panel-root').exists()).toBe(false)
  expect(wrapper.find('.voice-dock-idle').exists()).toBe(true)
  expect(wrapper.find('button').exists()).toBe(false)
  expect(wrapper.find('.voice-dock-root').text()).toBe('')
}

describe('VoiceDock renderer contract', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    handlers.clear()
    panelOpenMock.mockReset()
    panelStartMock.mockReset()
    panelStopMock.mockReset()
    panelToggleMock.mockReset()
    panelCancelHoldMock.mockReset()
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

  it('shows nothing while collapsed and auto-starts once a wake-word panel opens', async () => {
    const wrapper = mount(VoiceDock)

    expectIdle(wrapper)

    await openPanel('wake-word')

    const panel = wrapper.findComponent({ name: 'VoicePanel' })
    expect(panel.exists()).toBe(true)
    expect(panel.props('managedByDock')).toBe(true)
    expect(panelOpenMock).toHaveBeenCalledWith('wake-word')
    expect(panelStartMock).toHaveBeenCalledTimes(1)
  })
  it('starts an initial short toggle command only once while opening the collapsed dock', async () => {
    const wrapper = mount(VoiceDock)

    emit(AssistantEvents.voice.command, { action: 'toggle', mode: 'toggle', source: 'command' })
    await nextTick()
    await nextTick()
    await flushPromises()

    expect(panelStartMock).toHaveBeenCalledTimes(1)
    expect(panelToggleMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })
  it('starts after a command panel opens and forwards a later hold start again', async () => {
    const wrapper = mount(VoiceDock)
    let resolveOpen!: () => void
    panelOpenMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveOpen = resolve
        })
    )

    emit(AssistantEvents.voice.panelOpened, { source: 'command' })
    await nextTick()
    await nextTick()
    expect(panelOpenMock).toHaveBeenCalledWith('command')
    expect(panelStartMock).not.toHaveBeenCalled()

    resolveOpen()
    await flushPromises()
    expect(panelStartMock).toHaveBeenCalledTimes(1)

    emit(AssistantEvents.voice.command, { action: 'start', mode: 'hold', source: 'command' })
    await flushPromises()
    expect(panelStartMock).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })
  it('applies a command stop received during panel opening without starting voice', async () => {
    const wrapper = mount(VoiceDock)
    let resolveOpen!: () => void
    panelOpenMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveOpen = resolve
        })
    )

    emit(AssistantEvents.voice.panelOpened, { source: 'command' })
    await nextTick()
    await nextTick()
    emit(AssistantEvents.voice.command, { action: 'stop', mode: 'toggle', source: 'command' })

    resolveOpen()
    await flushPromises()
    await nextTick()

    expect(panelStartMock).not.toHaveBeenCalled()
    expect(panelStopMock).not.toHaveBeenCalled()
    expectIdle(wrapper)

    wrapper.unmount()
  })
  it('waits for the current panel open before starting after a stale opening is closed and reopened', async () => {
    const wrapper = mount(VoiceDock)
    const first = Promise.withResolvers<void>()
    const second = Promise.withResolvers<void>()
    panelOpenMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    emit(AssistantEvents.voice.panelOpened, { source: 'command' })
    await nextTick()
    await nextTick()
    emit(AssistantEvents.voice.panelClosed)
    await nextTick()

    emit(AssistantEvents.voice.panelOpened, { source: 'click' })
    await nextTick()
    await nextTick()
    expect(panelOpenMock).toHaveBeenNthCalledWith(1, 'command')
    expect(panelOpenMock).toHaveBeenNthCalledWith(2, 'click')

    first.resolve()
    await nextTick()
    await nextTick()
    // An old open may settle after a rapid close/reopen. Starting then lets the second open reset
    // an already recording session, so it must wait for the current open instead.
    expect(panelStartMock).not.toHaveBeenCalled()

    second.resolve()
    await nextTick()
    await nextTick()
    expect(panelStartMock).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it.each([
    { action: 'start' as const, mode: 'hold' as const, expected: panelStartMock },
    { action: 'stop' as const, mode: 'toggle' as const, expected: panelStopMock },
    { action: 'toggle' as const, mode: 'toggle' as const, expected: panelToggleMock }
  ])(
    'routes Command voice $action to the managed VoicePanel without selecting a delivery policy',
    async ({ action, mode, expected }) => {
      const wrapper = mount(VoiceDock)
      await openPanel()
      panelStartMock.mockClear()
      panelStopMock.mockClear()
      panelToggleMock.mockClear()

      emit(AssistantEvents.voice.command, { action, mode, source: 'command' })
      await nextTick()
      await nextTick()

      expect(expected).toHaveBeenCalledTimes(1)
      if (action !== 'stop') expect(expected).toHaveBeenCalledWith()
      wrapper.unmount()
    }
  )
  it.each(['start', 'reset', 'commit'] as const)(
    'relays a global Escape cancellation %s to the active VoicePanel',
    async (state) => {
      const wrapper = mount(VoiceDock)
      await openPanel()

      emit(AssistantEvents.voice.cancelHold, { state })
      await nextTick()

      expect(panelCancelHoldMock).toHaveBeenCalledWith(state)
      wrapper.unmount()
    }
  )
  it('queues a global cancellation commit until a mounted VoicePanel finishes opening', async () => {
    const wrapper = mount(VoiceDock)
    const opening = Promise.withResolvers<void>()
    panelOpenMock.mockImplementationOnce(() => opening.promise)

    emit(AssistantEvents.voice.panelOpened, { source: 'command' })
    await nextTick()
    await nextTick()
    expect(panelOpenMock).toHaveBeenCalledWith('command')

    emit(AssistantEvents.voice.cancelHold, { state: 'commit' })
    opening.resolve()
    await flushPromises()
    await nextTick()

    expect(panelCancelHoldMock).toHaveBeenCalledWith('commit')
    expect(panelStartMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows nothing once the VoicePanel finishes, and closes only after it has left', async () => {
    const wrapper = mount(VoiceDock)
    await openPanel()

    await wrapper.findComponent({ name: 'VoicePanel' }).vm.$emit('finished')
    await nextTick()

    // The wait for the transcript is expressed inside the pill now, so there is no
    // separate spinner phase left after the panel, and no resting surface to return to.
    expect(wrapper.find('.voice-dock-processing').exists()).toBe(false)
    expectIdle(wrapper)

    // Not yet: `closePanel` hides the window, which would cut the pill's own leave animation
    // off on its first frame. It waits for the surface to go.
    expect(transportSendMock).not.toHaveBeenCalledWith(AssistantEvents.voice.closePanel, undefined)

    // Test Utils stubs the transition, so `@after-leave` never arrives and the fallback is what
    // closes it — which is the same path a torn-down surface takes in production.
    vi.advanceTimersByTime(400)
    await nextTick()
    expect(transportSendMock).toHaveBeenCalledWith(AssistantEvents.voice.closePanel, undefined)

    vi.advanceTimersByTime(1000)
    await nextTick()
    expectIdle(wrapper)

    wrapper.unmount()
  })

  it('does not let a stale close fallback collapse a reopened recording', async () => {
    const wrapper = mount(VoiceDock)
    await openPanel()

    await wrapper.findComponent({ name: 'VoicePanel' }).vm.$emit('finished')
    await nextTick()
    expectIdle(wrapper)

    transportSendMock.mockClear()
    await openPanel()
    expect(wrapper.find('.voice-panel-root').exists()).toBe(true)

    vi.advanceTimersByTime(400)
    await nextTick()

    expect(transportSendMock).not.toHaveBeenCalledWith(AssistantEvents.voice.closePanel, undefined)
    expect(wrapper.find('.voice-panel-root').exists()).toBe(true)

    wrapper.unmount()
  })

  /**
   * With a real transition the close rides `@after-leave` rather than the fallback, so the
   * window keeps its size for exactly as long as the pill is still shrinking inside it and no
   * longer. The stub cannot show this: it never runs the hook, which is why the fallback exists.
   */
  it('closes as soon as the surface has finished leaving, without waiting out the fallback', async () => {
    const wrapper = mount(VoiceDock, { global: { stubs: { transition: false } } })
    await openPanel()
    vi.advanceTimersByTime(400)
    await nextTick()
    transportSendMock.mockClear()

    await wrapper.findComponent({ name: 'VoicePanel' }).vm.$emit('finished')
    await nextTick()

    // Well short of SURFACE_CLOSE_FALLBACK_MS: if this arrives, the hook is what sent it.
    vi.advanceTimersByTime(120)
    await nextTick()
    expect(transportSendMock).toHaveBeenCalledWith(AssistantEvents.voice.closePanel, undefined)

    wrapper.unmount()
  })

  /**
   * Every other test here mounts with Test Utils' default `<Transition>` stub, which renders
   * the incoming branch immediately. The real one does not: `mode="out-in"` keeps VoicePanel
   * unmounted until the idle placeholder has finished leaving, so the template ref is still
   * null a tick after `expanded` flips — and every `panel.value?.…` in that window silently
   * does nothing. That is a dock that opens, shows an empty pill, and never records.
   */
  it('waits for the panel to exist rather than for a tick', async () => {
    const wrapper = mount(VoiceDock, { global: { stubs: { transition: false } } })

    emit(AssistantEvents.voice.panelOpened, { source: 'click' })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.voice-panel-root').exists()).toBe(false)

    // Let the leave transition finish; the panel mounts now, long after those two ticks.
    vi.advanceTimersByTime(400)
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.voice-panel-root').exists()).toBe(true)
    expect(panelOpenMock).toHaveBeenCalledWith('click')
    expect(panelStartMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('holds a pill reopened mid-leave back until the last one has gone', async () => {
    const wrapper = mount(VoiceDock, { global: { stubs: { transition: false } } })

    await reopenWhileLastPillLeaves(wrapper, 'command')
    await nextTick()
    // Mounted now, it would sit beside the leaving pill — stacked below it, outside the window.
    expect(wrapper.findAll('.voice-panel-root')).toHaveLength(1)
    expect(panelOpenMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)
    await flushPromises()
    await nextTick()

    expect(wrapper.findAll('.voice-panel-root')).toHaveLength(1)
    expect(panelOpenMock).toHaveBeenCalledWith('command')
    expect(panelStartMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('starts recording after a released cancellation arrives before the VoicePanel mounts', async () => {
    const wrapper = mount(VoiceDock, { global: { stubs: { transition: false } } })

    emit(AssistantEvents.voice.panelOpened, { source: 'command' })
    await nextTick()
    emit(AssistantEvents.voice.cancelHold, { state: 'start' })
    emit(AssistantEvents.voice.cancelHold, { state: 'reset' })

    vi.advanceTimersByTime(400)
    await flushPromises()
    await nextTick()

    expect(panelCancelHoldMock).toHaveBeenCalledWith('reset')
    expect(panelStartMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('does not start recording when a global cancellation commits before the VoicePanel mounts', async () => {
    const wrapper = mount(VoiceDock, { global: { stubs: { transition: false } } })

    emit(AssistantEvents.voice.panelOpened, { source: 'command' })
    await nextTick()
    emit(AssistantEvents.voice.cancelHold, { state: 'commit' })

    vi.advanceTimersByTime(400)
    await flushPromises()
    await nextTick()

    expect(panelCancelHoldMock).toHaveBeenCalledWith('commit')
    expect(panelStartMock).not.toHaveBeenCalled()
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
