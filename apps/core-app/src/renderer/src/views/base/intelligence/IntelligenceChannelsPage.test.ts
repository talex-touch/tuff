// @vitest-environment jsdom
import {
  IntelligenceProviderType,
  type IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import {
  ON_DEVICE_ASR_CHANNEL_TYPE,
  TUFF_LOCAL_ASR_PROVIDER_ID
} from '@talex-touch/utils/intelligence/voice-asr'
import type * as RendererUtils from '@talex-touch/utils/renderer'
import type * as Vue from 'vue'
import { mount, type DOMWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.mock('~/modules/auth/useAuth', async () => {
  const { ref } = await vi.importActual<typeof Vue>('vue')
  return { useAuth: () => ({ isLoggedIn: ref(false) }) }
})

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
const managerMocks = vi.hoisted(() => ({
  providers: [] as IntelligenceProviderConfig[],
  updateProvider: vi.fn()
}))

/**
 * The provider set the mocked manager hands the page. The mock cannot close over a fixture declared
 * below it (factories are elevated above the imports), so the ref is published on a hoisted holder
 * that each test seeds before mounting.
 */
const manager = vi.hoisted(() => ({
  providers: undefined as unknown as Vue.Ref<IntelligenceProviderConfig[]>
}))

vi.mock('~/modules/hooks/useIntelligenceManager', async () => {
  const { computed, ref } = await vi.importActual<typeof Vue>('vue')
  const providers = ref<IntelligenceProviderConfig[]>([])
  manager.providers = providers
  return {
    useIntelligenceManager: () => ({
      providers,
      selectedProviderId: ref<string | null>(null),
      selectedProvider: computed<IntelligenceProviderConfig | null>(() => null),
      addProvider: vi.fn(),
      updateProvider: managerMocks.updateProvider,
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

/** A speech channel the user configured themselves. */
const dashscopeChannel: IntelligenceProviderConfig = {
  id: 'dashscope-asr',
  name: 'DashScope',
  enabled: true,
  type: IntelligenceProviderType.CUSTOM,
  metadata: { channelType: 'bailian' }
}

/** The dictation channel main seeds on this machine — stored exactly as the program owns it. */
const onDeviceChannel: IntelligenceProviderConfig = {
  id: TUFF_LOCAL_ASR_PROVIDER_ID,
  name: 'Local Speech',
  enabled: true,
  type: IntelligenceProviderType.CUSTOM,
  capabilities: ['audio.asr'],
  models: [{ id: 'sense-voice-small' }],
  defaultModel: 'sense-voice-small',
  metadata: {
    channelType: ON_DEVICE_ASR_CHANNEL_TYPE,
    voiceAsr: { protocol: 'local-offline' }
  }
}

/** The count badge on the group the aside list draws under "enabled". */
function enabledCountBadge(aside: DOMWrapper<Element>) {
  const enabledGroup = aside
    .findAll('.TuffListTemplate-Group')
    .find(
      (group) =>
        group.get('.TuffListTemplate-GroupTitleText').text() === 'intelligence.list.enabled'
    )
  if (!enabledGroup) throw new Error('the aside list drew no enabled group')
  return enabledGroup.get('.TuffListTemplate-Badge')
}

beforeEach(() => {
  manager.providers.value = []
})

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

  /**
   * The on-device dictation channel is seeded and bound by main from the speech models already
   * installed, with no endpoint and no credential: there is nothing about it to configure or to
   * delete. The aside list must therefore neither offer it as a channel nor count it as one, even
   * though it is a real entry of the stored provider config.
   */
  it('leaves the program-owned on-device channel out of the aside list and out of its count', async () => {
    manager.providers.value = [dashscopeChannel, onDeviceChannel]

    const wrapper = mountPage()
    await nextTick()

    const aside = wrapper.find('.TuffAsideTemplate-Aside')

    expect(aside.findAll('.TuffItemTemplate-TitleText').map((row) => row.text())).toEqual([
      'DashScope'
    ])
    expect(enabledCountBadge(aside).text()).toBe('1')

    wrapper.unmount()
  })

  it('displays the CLI guidance banner when a disabled CLI provider is detected and enables it on click', async () => {
    manager.providers.value = [
      {
        id: 'pi-cli-default',
        type: IntelligenceProviderType.LOCAL,
        name: 'Pi (local CLI)',
        enabled: false,
        metadata: { isLocalCli: true, origin: 'pi-cli' }
      }
    ]
    const wrapper = mountPage()
    await nextTick()

    const banner = wrapper.find('.cli-guide-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('settings.intelligence.cliDetectedTitle')

    const enableButton = banner.find('button')
    expect(enableButton.exists()).toBe(true)
    await enableButton.trigger('click')

    expect(managerMocks.updateProvider).toHaveBeenCalledWith('pi-cli-default', { enabled: true })

    wrapper.unmount()
  })
})
