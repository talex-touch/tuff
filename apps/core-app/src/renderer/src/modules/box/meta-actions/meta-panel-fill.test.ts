// @vitest-environment jsdom
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useMetaPanelFill } from './meta-panel-fill'

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

function mountFill() {
  let filled: ReturnType<typeof useMetaPanelFill> | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        filled = useMetaPanelFill()
        return () => h('div', { class: { 'is-filled': filled!.value } })
      }
    })
  )
  return { wrapper, filled: () => filled!.value }
}

function publish(payload: unknown): void {
  const listener = state.listeners.get(CoreBoxEvents.metaOverlay.panelState.toEventName())
  expect(listener, 'expected CoreBox to listen for the panel state').toBeTypeOf('function')
  listener!(payload)
}

describe('useMetaPanelFill', () => {
  afterEach(() => {
    state.listeners.clear()
  })

  it('fills only while main has the window grown for the panel', async () => {
    const { wrapper, filled } = mountFill()
    expect(filled()).toBe(false)

    publish({ visible: true, grown: true })
    expect(filled()).toBe(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('is-filled')

    // Open in a window that already fit it: nothing was added, so nothing is painted.
    publish({ visible: true, grown: false })
    expect(filled()).toBe(false)

    publish({ visible: true, grown: true })
    publish({ visible: false, grown: false })
    expect(filled()).toBe(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('is-filled')

    wrapper.unmount()
  })

  it('keeps painting after the panel closes, until the window it grew is back', () => {
    const { wrapper, filled } = mountFill()

    publish({ visible: true, grown: true })
    // Closed, with the animated restore still shrinking the window: the strip must not go clear.
    publish({ visible: false, grown: true })
    expect(filled()).toBe(true)

    publish({ visible: false, grown: false })
    expect(filled()).toBe(false)

    wrapper.unmount()
  })

  it('reads a malformed state as closed', () => {
    const { wrapper, filled } = mountFill()

    for (const payload of [undefined, null, {}, { visible: 'yes', grown: 1 }, { grown: true }]) {
      publish({ visible: true, grown: true })
      publish(payload)
      expect(filled(), JSON.stringify(payload)).toBe(false)
    }

    wrapper.unmount()
  })

  it('stops listening once CoreBox unmounts', () => {
    const { wrapper } = mountFill()
    expect(state.listeners.has(CoreBoxEvents.metaOverlay.panelState.toEventName())).toBe(true)

    wrapper.unmount()

    expect(state.listeners.has(CoreBoxEvents.metaOverlay.panelState.toEventName())).toBe(false)
  })
})
