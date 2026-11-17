// @vitest-environment jsdom

import type { BrowserWorkspaceState } from '@talex-touch/utils/transport/sdk/domains/browser'
import { BrowserEvents } from '@talex-touch/utils/transport/sdk/domains/browser'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeepAlive, defineComponent, nextTick, reactive, ref } from 'vue'
import {
  installMainWindowShortcutCapture,
  registerMainWindowCommandHandlers
} from '~/modules/shortcuts/main-window-shortcuts'

enableAutoUnmount(afterEach)

const route = reactive({ path: '/browser', query: {} as Record<string, string> })
const platformState = {
  isMac: ref(true),
  platform: ref('darwin')
}

let workspaceState: BrowserWorkspaceState
const changedListeners = new Set<(state: BrowserWorkspaceState) => void>()
const snapshotListeners = new Set<(payload: { tabId: string; snapshot: string }) => void>()
const focusAddressListeners = new Set<() => void>()

function makeState(
  tabs: Array<{ id: string; url: string; title: string }>,
  activeTabId: string,
  revision = 1
): BrowserWorkspaceState {
  return {
    revision,
    activeTabId,
    tabs: tabs.map((tab) => ({
      ...tab,
      favicon: null,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      error: null
    })),
    recent: [],
    bookmarks: []
  }
}

const sendMock = vi.fn(async (event: unknown, payload?: Record<string, unknown>) => {
  if (event === BrowserEvents.getState) return structuredClone(workspaceState)
  if (event === BrowserEvents.createTab) {
    const id = `tab-${workspaceState.tabs.length + 1}`
    workspaceState = {
      ...workspaceState,
      revision: workspaceState.revision + 1,
      activeTabId: id,
      tabs: [
        ...workspaceState.tabs,
        {
          id,
          url: String(payload?.input ?? ''),
          title: '',
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          error: null
        }
      ]
    }
    return structuredClone(workspaceState)
  }
  if (event === BrowserEvents.closeTab) {
    const targetId = String(payload?.tabId)
    const remaining = workspaceState.tabs.filter((tab) => tab.id !== targetId)
    workspaceState = {
      ...workspaceState,
      revision: workspaceState.revision + 1,
      tabs: remaining,
      activeTabId: remaining[0]?.id ?? ''
    }
    return structuredClone(workspaceState)
  }
  if (event === BrowserEvents.reload) {
    return structuredClone(workspaceState)
  }
  if (event === BrowserEvents.setViewport || event === BrowserEvents.captureSnapshot) {
    return { snapshot: null }
  }
  return structuredClone(workspaceState)
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: ref('en-US') })
}))
vi.mock('vue-router', () => ({
  useRoute: () => route
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
}))
vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => platformState
}))
vi.mock('~/modules/browser-connection/useBrowserConnection', () => ({
  isOpenableBrowserUrl: (url?: string) => Boolean(url && url.startsWith('http')),
  useBrowserConnection: () => ({
    activeProfile: ref(null),
    importCookies: vi.fn(),
    describeError: (msg: string) => msg
  })
}))
vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: sendMock,
    on: vi.fn((event: unknown, listener: (...args: never[]) => void) => {
      if (event === BrowserEvents.changed)
        changedListeners.add(listener as (state: BrowserWorkspaceState) => void)
      if (event === BrowserEvents.snapshot)
        snapshotListeners.add(listener as (payload: { tabId: string; snapshot: string }) => void)
      if (event === BrowserEvents.focusAddress) focusAddressListeners.add(listener as () => void)
      return () => {
        if (event === BrowserEvents.changed)
          changedListeners.delete(listener as (state: BrowserWorkspaceState) => void)
        if (event === BrowserEvents.snapshot)
          snapshotListeners.delete(
            listener as (payload: { tabId: string; snapshot: string }) => void
          )
        if (event === BrowserEvents.focusAddress)
          focusAddressListeners.delete(listener as () => void)
      }
    })
  })
}))
vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
  },
  TxIconButton: {
    props: ['label', 'disabled'],
    emits: ['click'],
    template:
      '<button type="button" :aria-label="label" :disabled="disabled" @click="$emit(\'click\', $event)" />'
  }
}))
vi.mock('@talex-touch/tuffex/skeleton', () => ({
  TxSkeleton: { template: '<div />' }
}))
vi.mock('~/views/base/Store.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../home/HomePage.vue', () => ({
  default: {
    props: ['browserLanding', 'browserActive', 'browserNavigate'],
    template: '<div data-testid="landing-home"><slot name="browser-footer" /></div>'
  }
}))
vi.mock('./BrowserSettingsTab.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./ChromeBookmarkDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./ChromeLibraryPanel.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./ChromeCookieDialog.vue', () => ({
  default: {
    props: ['modelValue'],
    template: '<div data-testid="cookie-dialog" :data-open="String(modelValue)" />'
  }
}))

import BrowserPage from './BrowserPage.vue'

describe('BrowserPage shortcuts & lifecycle hygiene', () => {
  let disposeCapture: (() => void) | null = null

  beforeEach(() => {
    route.path = '/browser'
    route.query = {}
    platformState.isMac.value = true
    platformState.platform.value = 'darwin'
    sendMock.mockClear()
    changedListeners.clear()
    snapshotListeners.clear()
    focusAddressListeners.clear()
    workspaceState = makeState([{ id: 't1', url: '', title: '' }], 't1', 1)
  })

  afterEach(() => {
    disposeCapture?.()
    disposeCapture = null
  })

  it('prioritizes ⌘L / Ctrl+L for the browser address bar over HomePage focus-composer on the Start Page', async () => {
    const homeComposerFocus = vi.fn()
    const disposeHome = registerMainWindowCommandHandlers([
      { id: 'focus-composer', run: homeComposerFocus }
    ])
    disposeCapture = installMainWindowShortcutCapture({ isMac: () => platformState.isMac.value })

    const wrapper = mount(BrowserPage, { attachTo: document.body })
    await flushPromises()
    await nextTick()

    const addressInput = wrapper.find('input').element as HTMLInputElement

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'l',
        code: 'KeyL',
        metaKey: true,
        cancelable: true
      })
    )
    await flushPromises()

    expect(homeComposerFocus).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(addressInput)

    disposeHome()
  })

  it('handles ⌘T / Ctrl+T, ⌘W / Ctrl+W, and ⌘R / Ctrl+R while ignoring auto-repeat and open dialogs', async () => {
    platformState.isMac.value = false
    platformState.platform.value = 'win32'
    workspaceState = makeState([{ id: 't1', url: 'https://one.example/', title: 'One' }], 't1', 1)

    const wrapper = mount(BrowserPage, { attachTo: document.body })
    await flushPromises()

    // Repeat keydown must not spam tabs.
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 't',
        code: 'KeyT',
        ctrlKey: true,
        repeat: true,
        cancelable: true
      })
    )
    expect(sendMock).not.toHaveBeenCalledWith(BrowserEvents.createTab, expect.anything())

    // Ctrl+T creates a new tab and focuses address bar.
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 't',
        code: 'KeyT',
        ctrlKey: true,
        cancelable: true
      })
    )
    await flushPromises()
    await nextTick()
    expect(sendMock).toHaveBeenCalledWith(BrowserEvents.createTab, {})
    expect(document.activeElement).toBe(wrapper.find('input').element)

    // Ctrl+W closes the active tab.
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'w',
        code: 'KeyW',
        ctrlKey: true,
        cancelable: true
      })
    )
    await flushPromises()
    expect(sendMock).toHaveBeenCalledWith(BrowserEvents.closeTab, { tabId: 'tab-2' })

    // Ctrl+R reloads active remote tab.
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'r',
        code: 'KeyR',
        ctrlKey: true,
        cancelable: true
      })
    )
    await flushPromises()
    expect(sendMock).toHaveBeenCalledWith(BrowserEvents.reload, { tabId: 't1' })

    // Shortcuts stay inactive while cookie dialog is open.
    sendMock.mockClear()
    const syncMoreBtn = wrapper.find('button[title="browser.cookies.modalTitle"]')
    if (syncMoreBtn.exists()) {
      await syncMoreBtn.trigger('click')
      await nextTick()
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'w',
          code: 'KeyW',
          ctrlKey: true,
          cancelable: true
        })
      )
      expect(sendMock).not.toHaveBeenCalledWith(BrowserEvents.closeTab, expect.anything())
    }
  })

  it('prunes closed-tab snapshots and suspends listeners while deactivated in KeepAlive', async () => {
    workspaceState = makeState(
      [
        { id: 't1', url: 'https://one.example/', title: 'One' },
        { id: 't2', url: 'https://two.example/', title: 'Two' }
      ],
      't1',
      1
    )

    const Host = defineComponent({
      components: { KeepAlive, BrowserPage },
      data: () => ({ showBrowser: true }),
      template: '<KeepAlive><BrowserPage v-if="showBrowser" /></KeepAlive>'
    })

    const host = mount(Host, { attachTo: document.body })
    await flushPromises()

    // Receive snapshot for t2 and t1.
    for (const listener of snapshotListeners) {
      listener({ tabId: 't2', snapshot: 'data:image/jpeg;base64,AAA' })
      listener({ tabId: 't1', snapshot: 'data:image/jpeg;base64,BBB' })
    }
    await nextTick()

    // Open library panel so frozen snapshot for t1 renders.
    await host.find('button[aria-label="browser.library"]').trigger('click')
    await nextTick()
    expect(host.find('img').attributes('src')).toBe('data:image/jpeg;base64,BBB')

    // Close t2, then confirm if id t2 is seen again no stale snapshot remains.
    for (const listener of changedListeners) {
      listener(makeState([{ id: 't1', url: 'https://one.example/', title: 'One' }], 't1', 2))
    }
    await nextTick()
    for (const listener of changedListeners) {
      listener(
        makeState(
          [
            { id: 't1', url: 'https://one.example/', title: 'One' },
            { id: 't2', url: 'https://two.example/', title: 'Two' }
          ],
          't2',
          3
        )
      )
    }
    await nextTick()
    expect(host.find('img').exists()).toBe(false)

    // Deactivate BrowserPage (switch away from /browser): shortcuts stop firing.
    host.vm.showBrowser = false
    await flushPromises()
    sendMock.mockClear()

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 't',
        code: 'KeyT',
        metaKey: true,
        cancelable: true
      })
    )
    expect(sendMock).not.toHaveBeenCalledWith(BrowserEvents.createTab, expect.anything())
  })
})
