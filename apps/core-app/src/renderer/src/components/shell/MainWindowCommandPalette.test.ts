// @vitest-environment jsdom

import type { MainWindowCommand } from '~/modules/shortcuts/main-window-shortcuts'
import type { VueWrapper } from '@vue/test-utils'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

enableAutoUnmount(afterEach)

/** What `useCoreBoxShortcut` reports: the label of the key that opens CoreBox now, or none. */
const coreBoxKey = ref<string | null>('⌥Space')

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))
vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isMac: ref(true) })
}))
vi.mock('~/modules/shortcuts/useCoreBoxShortcut', () => ({
  useCoreBoxShortcut: () => ({ effectiveLabel: coreBoxKey })
}))
vi.mock('@talex-touch/tuffex/modal', () => ({
  TxModal: { name: 'TxModal', template: '<div><slot /><slot name="footer" /></div>' }
}))
vi.mock('@talex-touch/tuffex/kbd', () => ({
  TxKbd: { name: 'TxKbd', template: '<kbd><slot /></kbd>' }
}))

import { MAIN_WINDOW_COMMAND_CATALOG } from '~/modules/shortcuts/main-window-command-catalog'
import MainWindowCommandPalette from './MainWindowCommandPalette.vue'

function command(id: string): MainWindowCommand {
  const descriptor = MAIN_WINDOW_COMMAND_CATALOG.find((candidate) => candidate.id === id)!
  return { ...descriptor, run: vi.fn() }
}

function mountPalette(): VueWrapper {
  return mount(MainWindowCommandPalette, {
    props: { modelValue: true, commands: [command('open-corebox'), command('open-settings')] }
  })
}

/** The key printed on a row, or `null` when the row prints none. */
function keyOf(wrapper: VueWrapper, id: string): string | null {
  const kbd = wrapper.find(`[data-command-id="${id}"] .MainWindowCommandPalette-Chord`)
  return kbd.exists() ? kbd.text() : null
}

/**
 * Open CoreBox runs on CoreBox's global key, so its row prints that key as it is bound right now:
 * ⌥Space by default, a rebind when there is one, and nothing while no key is registered. It used
 * to print the window's own ⌘E.
 */
describe('MainWindowCommandPalette Open CoreBox row', () => {
  afterEach(() => {
    coreBoxKey.value = '⌥Space'
  })

  it('prints the key that opens CoreBox right now, following it as it moves', async () => {
    const wrapper = mountPalette()

    expect(keyOf(wrapper, 'open-corebox')).toBe('⌥Space')
    // A command with an in-window chord still prints that chord.
    expect(keyOf(wrapper, 'open-settings')).toBe('⌘,')

    coreBoxKey.value = '⌘K'
    await nextTick()
    expect(keyOf(wrapper, 'open-corebox')).toBe('⌘K')
  })

  it('prints no key while none opens CoreBox, and still offers the command', () => {
    coreBoxKey.value = null
    const wrapper = mountPalette()

    expect(wrapper.find('[data-command-id="open-corebox"]').exists()).toBe(true)
    expect(keyOf(wrapper, 'open-corebox')).toBeNull()
  })
})
