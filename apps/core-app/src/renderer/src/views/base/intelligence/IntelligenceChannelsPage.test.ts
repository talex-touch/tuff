// @vitest-environment jsdom
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import type * as RendererUtils from '@talex-touch/utils/renderer'
import type * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import IntelligenceChannelsPage from './IntelligenceChannelsPage.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('~/modules/auth/useAuth', () => ({
  useAuth: () => ({ isLoggedIn: { value: false } })
}))

/**
 * Only the provider SDK is replaced. Everything else in the renderer barrel — the storage SDK
 * `app-storage` builds at import time, and the auth state it reads — stays real, so this mock does
 * not have to keep pace with whatever the page's import graph grows to depend on.
 */
vi.mock('@talex-touch/utils/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof RendererUtils>()),
  useIntelligenceSdk: () => ({
    testProvider: vi.fn(),
    deleteProviderConfig: vi.fn()
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: vi.fn() })
}))

vi.mock('~/modules/hooks/useIntelligenceManager', async () => {
  const { computed, ref } = await vi.importActual<typeof Vue>('vue')
  return {
    useIntelligenceManager: () => ({
      providers: ref<IntelligenceProviderConfig[]>([]),
      selectedProviderId: ref<string | null>(null),
      selectedProvider: computed<IntelligenceProviderConfig | null>(() => null),
      addProvider: vi.fn(),
      updateProvider: vi.fn(),
      removeProvider: vi.fn()
    })
  }
})

/**
 * The shell under test is `SettingsPage` itself, so it is mounted for real: the whole point is to
 * read the DOM it actually renders. The page's panes stay real too — they are what the shell has to
 * place. Only the basic-editor drawer is stubbed: it renders nothing until a provider is being
 * edited, and mounting it would drag the whole editor into a test about where the panes land.
 */
function mountPage() {
  return mount(IntelligenceChannelsPage, {
    global: {
      stubs: {
        TxDrawer: {
          name: 'TxDrawer',
          props: ['visible'],
          emits: ['update:visible'],
          template: '<div />'
        },
        TxButton: { name: 'TxButton', template: '<button><slot /></button>' }
      }
    }
  })
}

describe('IntelligenceChannelsPage shell', () => {
  /**
   * This page was one of four passing the four retired flags (`edge-blur`, `fill`, `flush`,
   * `integrated-drag-region`). `SettingsPage` declares none of them, so the page silently fell
   * back to the default `column` reading shell: a 940px centred column with pinned edge fades
   * and a reserved title-bar strip, instead of the full-bleed master/detail canvas it draws.
   */
  it('renders in the split shell rather than the reading column', async () => {
    const wrapper = mountPage()
    await nextTick()

    expect(wrapper.find('.SettingsPage-Split').exists()).toBe(true)
    expect(wrapper.find('.SettingsPage-Column').exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * The split shell is only split if both halves arrive: the provider list belongs to the aside,
   * the detail pane belongs to whatever is selected. The column shell renders neither, so a page
   * that quietly falls back to it loses both panes while still mounting without error.
   */
  it('lands the aside and detail slots in their own panes', async () => {
    const wrapper = mountPage()
    await nextTick()

    const aside = wrapper.find('.TuffAsideTemplate-Aside')
    const detail = wrapper.find('.TuffAsideTemplate-Main')

    expect(aside.exists()).toBe(true)
    expect(detail.exists()).toBe(true)

    expect(aside.findComponent({ name: 'IntelligenceList' }).exists()).toBe(true)
    expect(aside.findComponent({ name: 'IntelligenceEmptyState' }).exists()).toBe(false)

    // Nothing is selected, so the detail pane owns the empty state.
    expect(detail.findComponent({ name: 'IntelligenceEmptyState' }).exists()).toBe(true)
    expect(detail.findComponent({ name: 'IntelligenceList' }).exists()).toBe(false)

    wrapper.unmount()
  })
})
