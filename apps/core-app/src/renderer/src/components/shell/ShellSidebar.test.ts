// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'

enableAutoUnmount(afterEach)

/** What `useCoreBoxShortcut` reports: the label of the key that opens CoreBox, or none. */
const coreBoxShortcutLabel = ref<string | null>(null)
const route = reactive({ path: '/home' })

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))
vi.mock('vue-router', () => ({
  useRoute: () => route
}))
vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: vi.fn(async () => undefined) })
}))
vi.mock('~/modules/shortcuts/useCoreBoxShortcut', () => ({
  useCoreBoxShortcut: () => ({ effectiveLabel: coreBoxShortcutLabel })
}))
// The hint used to be derived from the platform alone. Pinned to macOS, that derivation prints ⌘E
// whatever is bound, which is what the first assertion below rules out.
vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isMac: ref(true), platform: ref('darwin') })
}))
vi.mock('~/modules/conversation/useConversationEntry', () => ({
  useConversationEntry: () => ({
    enterConversation: vi.fn(),
    enterPickedProjectConversation: vi.fn()
  })
}))
vi.mock('~/modules/layout/useProjectFolders', () => ({
  blankConversationOwner: () => null
}))
vi.mock('~/modules/layout/useShellSidebar', () => ({
  useShellSidebar: () => ({ collapsed: ref(false), isDragging: ref(false), startDrag: vi.fn() })
}))
vi.mock('~/modules/settings/categories', () => ({
  groupedSettingNavigation: () => []
}))
vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: { dev: { developerMode: false } }
}))
vi.mock('~/modules/hooks/env-hooks', () => ({
  useEnv: () => ({ packageJson: ref(null) })
}))
vi.mock('~/stores/projects', () => ({
  useProjectStore: () => ({ initialize: vi.fn(async () => undefined), activeProjectId: null })
}))
vi.mock('./MetaHintBadge.vue', () => ({ default: { template: '<span />' } }))
vi.mock('./ShellBackRow.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./ShellChromeBar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./ShellConversationList.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./ShellNavGroup.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('./ShellNavItem.vue', () => ({ default: { template: '<div><slot name="hint" /></div>' } }))

import ShellSidebar from './ShellSidebar.vue'

/**
 * The search entry at the top of the sidebar teaches the key that opens CoreBox. That key is
 * ⌥Space by default, or whatever the user rebinds it to; with no live key (refused by the OS, or
 * lost to an in-app conflict) there is nothing to teach, and no other key stands in.
 */
describe('ShellSidebar search entry', () => {
  it('prints the key that opens CoreBox, following it as it moves', async () => {
    coreBoxShortcutLabel.value = '⌥Space'
    const wrapper = mount(ShellSidebar)

    expect(wrapper.find('.ShellSearchEntry-Kbd').text()).toBe('⌥Space')

    coreBoxShortcutLabel.value = '⌘K'
    await nextTick()
    expect(wrapper.find('.ShellSearchEntry-Kbd').text()).toBe('⌘K')
  })

  it('prints no key when none opens CoreBox', () => {
    coreBoxShortcutLabel.value = null
    const wrapper = mount(ShellSidebar)

    expect(wrapper.find('.ShellSearchEntry').exists()).toBe(true)
    expect(wrapper.find('.ShellSearchEntry-Kbd').exists()).toBe(false)
  })
})
