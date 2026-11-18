// @vitest-environment jsdom

import type { BrowserWorkspaceState } from '@talex-touch/utils/transport/sdk/domains/browser'
import { BrowserEvents } from '@talex-touch/utils/transport/sdk/domains/browser'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

const listeners = new Set<(state: BrowserWorkspaceState) => void>()
let getStateDeferred: PromiseWithResolvers<BrowserWorkspaceState> | null = null
let sendImpl: (event: unknown, payload?: unknown) => Promise<BrowserWorkspaceState>

const makeState = (revision: number): BrowserWorkspaceState => ({
  revision,
  activeTabId: 't1',
  tabs: [
    {
      id: 't1',
      url: '',
      title: '',
      favicon: null,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      error: null
    }
  ],
  recent: [],
  bookmarks: []
})

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: (event: unknown, payload?: unknown) => sendImpl(event, payload),
    on: (event: unknown, listener: (state: BrowserWorkspaceState) => void) => {
      if (event === BrowserEvents.changed) listeners.add(listener)
      return () => {
        if (event === BrowserEvents.changed) listeners.delete(listener)
      }
    }
  })
}))

import { useBrowserWorkspace } from './useBrowserWorkspace'

const Consumer = defineComponent({
  setup() {
    return useBrowserWorkspace()
  },
  template: '<div />'
})

describe('useBrowserWorkspace lifecycle & stale state hygiene', () => {
  beforeEach(() => {
    listeners.clear()
    getStateDeferred = null
    sendImpl = async () => makeState(1)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shares one subscription across consumers and clears transient flags when the last consumer unmounts', async () => {
    const first = mount(Consumer)
    await flushPromises()
    expect(listeners.size).toBe(1)

    const second = mount(Consumer)
    await flushPromises()
    expect(listeners.size).toBe(1)

    first.vm.tabMenuOpen = true
    first.vm.pluginToolbarOpen = true
    first.vm.accountOpen = true
    first.vm.error = 'stale error'

    first.unmount()
    expect(listeners.size).toBe(1)
    expect(second.vm.tabMenuOpen).toBe(true)

    second.unmount()
    expect(listeners.size).toBe(0)
    expect(second.vm.tabMenuOpen).toBe(false)
    expect(second.vm.pluginToolbarOpen).toBe(false)
    expect(second.vm.accountOpen).toBe(false)
    expect(second.vm.error).toBe('')
  })

  it('ignores stale getState rejections after a newer command or unmount', async () => {
    getStateDeferred = Promise.withResolvers<BrowserWorkspaceState>()
    sendImpl = async (event) => {
      if (event === BrowserEvents.getState) return getStateDeferred!.promise
      return makeState(99)
    }

    const wrapper = mount(Consumer)
    expect(listeners.size).toBe(1)

    await wrapper.vm.command(() => Promise.resolve(makeState(100)))
    expect(wrapper.vm.state?.revision).toBe(100)
    expect(wrapper.vm.error).toBe('')

    getStateDeferred.reject(new Error('late getState failure'))
    await flushPromises()

    expect(wrapper.vm.error).toBe('')
    expect(wrapper.vm.state?.revision).toBe(100)

    wrapper.unmount()
  })
})
