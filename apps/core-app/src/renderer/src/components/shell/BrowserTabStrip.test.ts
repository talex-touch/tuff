// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserWorkspaceState } from '@talex-touch/utils/transport/sdk/domains/browser'
import { BrowserEvents } from '@talex-touch/utils/transport/sdk/domains/browser'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'

enableAutoUnmount(afterEach)

const route = reactive({ path: '/browser' })
const routerPush = vi.fn(async (to: string) => {
  route.path = to
})
const platformState = {
  isMac: ref(true),
  platform: ref('darwin')
}

let workspaceState: BrowserWorkspaceState
const changedListeners = new Set<(state: BrowserWorkspaceState) => void>()

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
  if (event === BrowserEvents.getState) {
    return structuredClone(workspaceState)
  }
  if (event === BrowserEvents.activateTab) {
    workspaceState = {
      ...workspaceState,
      revision: workspaceState.revision + 1,
      activeTabId: String(payload?.tabId)
    }
    return structuredClone(workspaceState)
  }
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
          url: '',
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
      activeTabId:
        workspaceState.activeTabId === targetId
          ? (remaining[0]?.id ?? '')
          : workspaceState.activeTabId
    }
    return structuredClone(workspaceState)
  }
  return structuredClone(workspaceState)
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params?.title ? `${key}:${params.title}` : key
  })
}))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: routerPush })
}))
vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => platformState
}))
vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: sendMock,
    on: vi.fn((event: unknown, listener: (payload: BrowserWorkspaceState) => void) => {
      if (event === BrowserEvents.changed) changedListeners.add(listener)
      return () => {
        if (event === BrowserEvents.changed) changedListeners.delete(listener)
      }
    })
  })
}))
vi.mock('~/views/base/browser/BrowserPluginToolbar.vue', () => ({
  default: { name: 'BrowserPluginToolbar', template: '<div data-testid="plugin-toolbar" />' }
}))
vi.mock('./ShellAccountAvatar.vue', () => ({
  default: { name: 'ShellAccountAvatar', template: '<div data-testid="account-avatar" />' }
}))
vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    props: ['size', 'variant'],
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
  },
  TxIconButton: {
    props: ['icon', 'size', 'label', 'disabled'],
    emits: ['click'],
    template:
      '<button type="button" :aria-label="label" :disabled="disabled" @click="$emit(\'click\', $event)" />'
  }
}))
vi.mock('@talex-touch/tuffex/context-menu', () => ({
  TxContextMenu: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    methods: {
      openAt(this: { $emit: (event: string, value: boolean) => void }) {
        this.$emit('update:modelValue', true)
      }
    },
    template:
      '<div data-testid="tab-context-menu" :data-open="String(modelValue)"><slot name="menu" /></div>'
  },
  TxContextMenuDivider: { template: '<hr />' },
  TxContextMenuItem: {
    props: ['disabled'],
    template:
      '<button type="button" :disabled="disabled" @click="$emit(\'select\')"><slot /></button>'
  }
}))
vi.mock('@talex-touch/tuffex/skeleton', () => ({
  TxSkeleton: { template: '<div data-testid="tab-skeleton" />' }
}))

import BrowserTabStrip from './BrowserTabStrip.vue'

const DIR = dirname(fileURLToPath(import.meta.url))

function extractSfcCss(relativeFile: string): string {
  const source = readFileSync(resolve(DIR, relativeFile), 'utf8')
  const match = /<style[^>]*lang="scss"[^>]*>([\s\S]*?)<\/style>/i.exec(source)
  if (!match) throw new Error(`Missing <style lang="scss"> in ${relativeFile}`)
  return sass.compileString(match[1]!, { style: 'expanded' }).css
}

describe('BrowserTabStrip layout, drag regions & tab actions', () => {
  beforeEach(() => {
    route.path = '/browser'
    platformState.isMac.value = true
    platformState.platform.value = 'darwin'
    sendMock.mockClear()
    routerPush.mockClear()
    changedListeners.clear()
    workspaceState = makeState(
      [
        { id: 't1', url: 'https://one.example/', title: 'One' },
        { id: 't2', url: 'https://two.example/', title: 'Two' }
      ],
      't1',
      10
    )
  })

  it('keeps drag regions separated from interactive tabs, add-tab button, and trailing chrome', async () => {
    const wrapper = mount(BrowserTabStrip)
    await flushPromises()

    const tabbar = wrapper.find('[data-browser-tabbar]')
    const tablist = wrapper.find('[role="tablist"]')
    const dragHandle = wrapper.find('[data-browser-window-drag]')
    const addButton = wrapper.find('button[aria-label="browser.addTab"]')
    const actions = wrapper.find('.BrowserTabStrip-Actions')

    expect(tabbar.classes()).toContain('BrowserTabStrip')
    expect(dragHandle.classes()).toContain('BrowserTabStrip-DragRegion')
    expect(dragHandle.classes()).toContain('flex-1')
    expect(dragHandle.classes()).toContain('min-w-12')

    // role="tablist" must own only tab elements and must opt itself out of window dragging.
    expect(tablist.classes()).toContain('BrowserTabStrip-NoDrag')
    expect(tablist.findAll('[role="tab"]')).toHaveLength(2)
    expect(tablist.find('button[aria-label="browser.addTab"]').exists()).toBe(false)

    // Add-tab button sits outside tablist in a no-drag wrapper so it remains reachable on overflow.
    expect(addButton.exists()).toBe(true)
    expect(addButton.element.closest('.BrowserTabStrip-NoDrag')).not.toBeNull()

    // Every tab container carries no-drag isolation.
    for (const tabEl of wrapper.findAll('.BrowserTabStrip-Tab')) {
      expect(tabEl.classes()).toContain('BrowserTabStrip-NoDrag')
    }

    // Trailing chrome reserves Windows/Linux control inset and opts out of drag on /browser.
    expect(actions.classes()).toContain('shell-chrome-safe-inline-end')
    expect(actions.classes()).toContain('BrowserTabStrip-NoDrag')
    expect(wrapper.find('[data-testid="plugin-toolbar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="account-avatar"]').exists()).toBe(true)
  })

  it('reserves trailing window-control inset without creating an active no-drag hit box off /browser', async () => {
    platformState.isMac.value = false
    platformState.platform.value = 'win32'
    route.path = '/home'

    const wrapper = mount(BrowserTabStrip)
    await flushPromises()

    const tabbar = wrapper.find('[data-browser-tabbar]')
    const actions = wrapper.find('.BrowserTabStrip-Actions')
    expect(tabbar.attributes('data-platform')).toBe('win32')
    expect(tabbar.classes()).toContain('is-window-controls')
    expect(actions.classes()).toContain('shell-chrome-safe-inline-end')
    expect(actions.classes()).not.toContain('BrowserTabStrip-NoDrag')
    expect(wrapper.find('[data-testid="plugin-toolbar"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="account-avatar"]').exists()).toBe(false)
  })

  it('compiles explicit drag/no-drag regions, scrollbar hiding, and AppShell resize guard', () => {
    const stripCss = extractSfcCss('./BrowserTabStrip.vue')
    expect(stripCss).toMatch(/\.BrowserTabStrip\s*\{[\s\S]*-webkit-app-region:\s*drag;/)
    expect(stripCss).toMatch(/\.BrowserTabStrip-DragRegion\s*\{[\s\S]*-webkit-app-region:\s*drag;/)
    expect(stripCss).toMatch(/\.BrowserTabStrip-NoDrag\s*\{[\s\S]*-webkit-app-region:\s*no-drag;/)
    expect(stripCss).toMatch(
      /\.BrowserTabStrip-NoDrag\s+:deep\(\*\)\s*\{[\s\S]*-webkit-app-region:\s*no-drag;/
    )
    expect(stripCss).toMatch(/\.BrowserTabStrip-TabList\s*\{[\s\S]*scrollbar-width:\s*none;/)
    expect(stripCss).toMatch(/\.BrowserTabStrip-Tab\s*\{[\s\S]*border-radius:\s*999px;/)
    expect(stripCss).toMatch(
      /@supports\s*\(corner-shape:\s*superellipse\(2\)\)\s*\{[\s\S]*\.BrowserTabStrip-Tab\s*\{[\s\S]*corner-shape:\s*var\(--tx-corner-smooth-shape/
    )
    expect(stripCss).toMatch(
      /@supports\s*\(corner-shape:\s*superellipse\(2\)\)\s*\{[\s\S]*\.BrowserTabStrip-AddBtn\s*\{[\s\S]*corner-shape:\s*var\(--tx-corner-smooth-shape/
    )

    const shellCss = extractSfcCss('../../views/layout/AppShell.vue')
    expect(shellCss).toMatch(
      /\.AppShell\.is-resizing\s+\.BrowserTabStrip[\s\S]*-webkit-app-region:\s*no-drag;/
    )
    expect(shellCss).toMatch(
      /\.AppShell\.is-resizing\s+\[data-browser-window-drag\][\s\S]*-webkit-app-region:\s*no-drag;/
    )
  })

  it('navigates to /browser before activating or creating tabs from other routes, and closes tabs in place', async () => {
    route.path = '/home'
    const wrapper = mount(BrowserTabStrip)
    await flushPromises()

    // Middle-click closes background tab without leaving /home.
    await wrapper.findAll('.BrowserTabStrip-Tab')[1]!.trigger('auxclick', { button: 1 })
    await flushPromises()
    expect(sendMock).toHaveBeenCalledWith(BrowserEvents.closeTab, { tabId: 't2' })
    expect(route.path).toBe('/home')

    // Clicking + from /home switches to /browser and creates a tab.
    await wrapper.find('button[aria-label="browser.addTab"]').trigger('click')
    await flushPromises()
    expect(routerPush).toHaveBeenCalledWith('/browser')
    expect(sendMock).toHaveBeenCalledWith(BrowserEvents.createTab, {})

    // Clicking an already-active tab while on /browser skips redundant activateTab IPC.
    sendMock.mockClear()
    const activeTabButton = wrapper.find(`#browser-tab-${workspaceState.activeTabId}`)
    await activeTabButton.trigger('click')
    await flushPromises()
    expect(sendMock).not.toHaveBeenCalledWith(BrowserEvents.activateTab, expect.anything())
  })

  it('converts vertical wheel deltas into horizontal tablist scroll when overflowing', async () => {
    const wrapper = mount(BrowserTabStrip)
    await flushPromises()

    const tablist = wrapper.find('[role="tablist"]').element as HTMLElement
    Object.defineProperty(tablist, 'scrollWidth', { value: 600, configurable: true })
    Object.defineProperty(tablist, 'clientWidth', { value: 240, configurable: true })
    tablist.scrollLeft = 20

    await wrapper.find('[role="tablist"]').trigger('wheel', { deltaY: 45, deltaX: 0 })
    expect(tablist.scrollLeft).toBe(65)
  })

  it('closes an open tab context menu if its target tab disappears', async () => {
    const wrapper = mount(BrowserTabStrip)
    await flushPromises()

    await wrapper.findAll('.BrowserTabStrip-Tab')[1]!.trigger('contextmenu')
    await nextTick()
    expect(wrapper.find('[data-testid="tab-context-menu"]').attributes('data-open')).toBe('true')

    const next = makeState([{ id: 't1', url: 'https://one.example/', title: 'One' }], 't1', 20)
    for (const listener of changedListeners) listener(next)
    await nextTick()

    expect(wrapper.find('[data-testid="tab-context-menu"]').attributes('data-open')).toBe('false')
  })
})
