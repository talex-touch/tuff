// @vitest-environment jsdom
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useMetaPanelState } from './meta-panel-fill'

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>()
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (event: { toEventName: () => string }, callback: (payload?: unknown) => void) => {
      const key = event.toEventName()
      state.listeners.set(key, callback)
      return () => {
        if (state.listeners.get(key) === callback) state.listeners.delete(key)
      }
    }
  })
}))

function mountPanelState() {
  let panel: ReturnType<typeof useMetaPanelState> | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        panel = useMetaPanelState()
        return () =>
          h('div', { class: { 'is-filled': panel!.fill.value, 'is-blurred': panel!.blur.value } })
      }
    })
  )
  return { wrapper, filled: () => panel!.fill.value, blurred: () => panel!.blur.value }
}

function publish(payload: unknown): void {
  const listener = state.listeners.get(CoreBoxEvents.metaOverlay.panelState.toEventName())
  expect(listener, 'expected CoreBox to listen for the panel state').toBeTypeOf('function')
  listener!(payload)
}

describe('useMetaPanelState fill', () => {
  afterEach(() => {
    state.listeners.clear()
  })

  it('fills only while main has the window grown for the panel', async () => {
    const { wrapper, filled } = mountPanelState()
    expect(filled()).toBe(false)

    publish({ visible: true, grown: true, blur: false })
    expect(filled()).toBe(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('is-filled')

    // Open in a window that already fit it: nothing was added, so nothing is painted.
    publish({ visible: true, grown: false, blur: false })
    expect(filled()).toBe(false)

    publish({ visible: true, grown: true, blur: false })
    publish({ visible: false, grown: false, blur: false })
    expect(filled()).toBe(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('is-filled')

    wrapper.unmount()
  })

  it('keeps painting after the panel closes, until the window it grew is back', () => {
    const { wrapper, filled } = mountPanelState()

    publish({ visible: true, grown: true, blur: false })
    // Closed, with the animated restore still shrinking the window: the strip must not go clear.
    publish({ visible: false, grown: true, blur: false })
    expect(filled()).toBe(true)

    publish({ visible: false, grown: false, blur: false })
    expect(filled()).toBe(false)

    wrapper.unmount()
  })

  it('reads a malformed state as closed', () => {
    const { wrapper, filled } = mountPanelState()

    for (const payload of [undefined, null, {}, { visible: 'yes', grown: 1 }, { grown: true }]) {
      publish({ visible: true, grown: true, blur: false })
      publish(payload)
      expect(filled(), JSON.stringify(payload)).toBe(false)
    }

    wrapper.unmount()
  })

  it('stops listening once CoreBox unmounts', () => {
    const { wrapper } = mountPanelState()
    expect(state.listeners.has(CoreBoxEvents.metaOverlay.panelState.toEventName())).toBe(true)

    wrapper.unmount()

    expect(state.listeners.has(CoreBoxEvents.metaOverlay.panelState.toEventName())).toBe(false)
  })
})

describe('useMetaPanelState blur', () => {
  afterEach(() => {
    state.listeners.clear()
  })

  it('blurs while the open card shows a Flow page, and clears with the card or its action list', async () => {
    const { wrapper, blurred } = mountPanelState()
    expect(blurred()).toBe(false)

    publish({ visible: true, grown: true, blur: true })
    expect(blurred()).toBe(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('is-blurred')

    // Back to the action list, the window still grown for the card.
    publish({ visible: true, grown: true, blur: false })
    expect(blurred()).toBe(false)

    publish({ visible: true, grown: false, blur: true })
    publish({ visible: false, grown: false, blur: false })
    expect(blurred()).toBe(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('is-blurred')

    wrapper.unmount()
  })

  it('never blurs a closed panel, whatever the payload says', () => {
    const { wrapper, blurred } = mountPanelState()

    publish({ visible: false, grown: true, blur: true })
    expect(blurred()).toBe(false)

    wrapper.unmount()
  })

  it('reads a malformed or older state, without blur, as not blurred', () => {
    const { wrapper, blurred } = mountPanelState()

    for (const payload of [
      undefined,
      null,
      {},
      { visible: true, grown: true },
      { visible: true, grown: true, blur: 'yes' },
      { visible: 'yes', grown: true, blur: true },
      { blur: true }
    ]) {
      publish({ visible: true, grown: true, blur: true })
      publish(payload)
      expect(blurred(), JSON.stringify(payload)).toBe(false)
    }

    wrapper.unmount()
  })
})
