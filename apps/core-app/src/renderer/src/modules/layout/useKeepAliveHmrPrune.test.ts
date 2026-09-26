// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- The page factory and the shell are test doubles for
   AppShell's KeepAlive and the route pages it caches; they only exist together. */
import type { HotUpdatePayload } from './useKeepAliveHmrPrune'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useKeepAliveHmrPrune } from './useKeepAliveHmrPrune'

/** The dev server root; update payloads name files relative to it. */
const ROOT = '/repo/apps/core-app/src/renderer'

const PAGE_FILES = {
  home: `${ROOT}/src/views/base/home/HomePage.vue`,
  settings: `${ROOT}/src/views/base/settings/categories/SettingGeneralPage.vue`,
  capabilities: `${ROOT}/src/views/base/intelligence/IntelligenceCapabilitiesPage.vue`
}

/** How the dev server names a file inside its root in an update payload. */
function devUrl(file: string): string {
  return file.slice(ROOT.length)
}

/** A route page as the SFC compiler emits it in dev: named, logging its lifecycle, with its file. */
function createPage(name: string, file: string, log: string[]) {
  const page = defineComponent({
    name,
    setup() {
      const clicks = ref(0)
      onMounted(() => log.push(`${name} mounted`))
      onUnmounted(() => log.push(`${name} unmounted`))
      return () =>
        h('button', { class: name, onClick: () => clicks.value++ }, `${name}:${clicks.value}`)
    }
  })
  return Object.assign(page, { __file: file })
}

/** AppShell's shape: one KeepAlive keyed by page, its `exclude` driven by the composable. */
function mountShell() {
  const log: string[] = []
  const pages = {
    home: createPage('HomePage', PAGE_FILES.home, log),
    settings: createPage('SettingGeneralPage', PAGE_FILES.settings, log),
    capabilities: createPage('IntelligenceCapabilitiesPage', PAGE_FILES.capabilities, log)
  }
  const current = ref<keyof typeof pages>('home')
  const listeners = new Set<(payload: HotUpdatePayload) => void>()
  const hot = {
    on: (_event: 'vite:afterUpdate', listener: (payload: HotUpdatePayload) => void) =>
      listeners.add(listener),
    off: (_event: 'vite:afterUpdate', listener: (payload: HotUpdatePayload) => void) =>
      listeners.delete(listener)
  }
  // What vue-router hands back once every lazy page has been visited.
  const router = {
    getRoutes: () =>
      Object.values(pages).map((page) => ({
        meta: { keepAlive: true },
        components: { default: page }
      }))
  }

  const Shell = defineComponent({
    setup() {
      const exclude = useKeepAliveHmrPrune(hot, router)
      return () =>
        h(KeepAlive, { max: 10, exclude: exclude.value }, [
          h(pages[current.value], { key: current.value })
        ])
    }
  })
  const wrapper = mount(Shell)

  async function show(page: keyof typeof pages): Promise<void> {
    current.value = page
    await nextTick()
  }
  async function click(name: string): Promise<void> {
    await wrapper.get(`button.${name}`).trigger('click')
  }
  /** Delivers a `vite:afterUpdate` naming these module URLs, and lets the prune finish. */
  async function hotUpdate(...urls: string[]): Promise<void> {
    const payload: HotUpdatePayload = {
      updates: urls.map((url) => ({ type: 'js-update', path: url, acceptedPath: url }))
    }
    for (const listener of listeners) listener(payload)
    // A prune run spans several ticks; a macrotask boundary lets all of them finish.
    await flushPromises()
  }
  const text = (name: string) => wrapper.get(`button.${name}`).text()
  const count = (entry: string) => log.filter((line) => line === entry).length

  return { wrapper, log, listeners, show, click, hotUpdate, text, count }
}

describe('useKeepAliveHmrPrune', () => {
  it('keeps a cached page alive while no update arrives', async () => {
    const shell = mountShell()
    await shell.click('HomePage')
    await shell.show('settings')
    await shell.show('home')

    expect(shell.count('HomePage mounted')).toBe(1)
    expect(shell.text('HomePage')).toBe('HomePage:1')
    shell.wrapper.unmount()
  })

  it('prunes nothing for an update to a file no cached page is defined in', async () => {
    const shell = mountShell()
    await shell.click('HomePage')
    await shell.show('capabilities')
    await shell.show('settings')

    // The prompt editor is a component inside the capabilities page, not a page of its own.
    await shell.hotUpdate(
      '/src/components/intelligence/capabilities/IntelligenceCapabilityInfo.vue',
      '/src/modules/hooks/useIntelligenceManager.ts'
    )

    expect(shell.log.filter((line) => line.endsWith('unmounted'))).toEqual([])
    await shell.show('home')
    expect(shell.count('HomePage mounted')).toBe(1)
    expect(shell.text('HomePage')).toBe('HomePage:1')
    shell.wrapper.unmount()
  })

  it('drops only the cached page whose own component was updated', async () => {
    // The 2026-09-15 incident: the capabilities page sat in the cache while its file changed.
    const shell = mountShell()
    await shell.click('HomePage')
    await shell.show('capabilities')
    await shell.click('IntelligenceCapabilitiesPage')
    await shell.show('settings')

    await shell.hotUpdate(devUrl(PAGE_FILES.capabilities))

    expect(shell.log.filter((line) => line.endsWith('unmounted'))).toEqual([
      'IntelligenceCapabilitiesPage unmounted'
    ])

    // Reopened, the updated page is a new instance; Home kept its instance and state.
    await shell.show('capabilities')
    expect(shell.count('IntelligenceCapabilitiesPage mounted')).toBe(2)
    expect(shell.text('IntelligenceCapabilitiesPage')).toBe('IntelligenceCapabilitiesPage:0')
    await shell.show('home')
    expect(shell.count('HomePage mounted')).toBe(1)
    expect(shell.text('HomePage')).toBe('HomePage:1')
    shell.wrapper.unmount()
  })

  it('never drops the page on screen, even when its own component was updated', async () => {
    const shell = mountShell()
    await shell.show('settings')
    await shell.click('SettingGeneralPage')

    await shell.hotUpdate(devUrl(PAGE_FILES.settings))

    expect(shell.log).not.toContain('SettingGeneralPage unmounted')
    expect(shell.text('SettingGeneralPage')).toBe('SettingGeneralPage:1')

    // It went back into the cache: leaving and returning keeps the same instance.
    await shell.show('home')
    await shell.show('settings')
    expect(shell.log).not.toContain('SettingGeneralPage unmounted')
    expect(shell.count('SettingGeneralPage mounted')).toBe(1)
    expect(shell.text('SettingGeneralPage')).toBe('SettingGeneralPage:1')
    shell.wrapper.unmount()
  })

  it('ignores an update that only swapped a page stylesheet', async () => {
    const shell = mountShell()
    await shell.click('HomePage')
    await shell.show('settings')

    await shell.hotUpdate(
      `${devUrl(PAGE_FILES.home)}?vue&type=style&index=0&scoped=3f1c2a&lang.scss`
    )

    expect(shell.log).not.toContain('HomePage unmounted')
    shell.wrapper.unmount()
  })

  it('matches a page served from outside the dev server root', async () => {
    const shell = mountShell()
    await shell.show('capabilities')
    await shell.show('settings')

    await shell.hotUpdate(`/@fs${PAGE_FILES.capabilities}`)

    expect(shell.log).toContain('IntelligenceCapabilitiesPage unmounted')
    shell.wrapper.unmount()
  })

  it('stops listening once the shell is gone', () => {
    const shell = mountShell()
    expect(shell.listeners.size).toBe(1)

    shell.wrapper.unmount()

    expect(shell.listeners.size).toBe(0)
  })
})
