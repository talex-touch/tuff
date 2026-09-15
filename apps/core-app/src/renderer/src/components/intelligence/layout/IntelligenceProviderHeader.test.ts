// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- The two components declared here are test doubles
   for the tuffex dropdown the header composes, not components this file owns. */
/**
 * The provider action menu's official-channel gate.
 *
 * A Nexus-managed provider is one Tuff maintains on the user's behalf, so its record must never be
 * offered for clipboard/share/file export — `createProviderConfigText()` serialises the whole
 * provider. Only 复制 ID survives for that channel; the ordinary channel keeps the full menu.
 *
 * TxDropdownMenu is stubbed to an in-tree panel that always renders its items, so the assertions
 * read the menu's composition instead of driving the open interaction (which the primitive's own
 * tests cover). `isNexusManagedProvider` is left real: the gate is the integration point under
 * test, and the classifier is covered by its own suite.
 */
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import IntelligenceProviderHeader from './IntelligenceProviderHeader.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@talex-touch/utils/renderer/storage', () => ({
  intelligenceSettings: { updateProvider: vi.fn() }
}))

vi.mock('@talex-touch/tuffex/dropdown-menu', () => ({
  TxDropdownMenu: defineComponent({
    name: 'TxDropdownMenu',
    props: { modelValue: { type: Boolean, default: false } },
    emits: ['update:modelValue'],
    setup(_props, { slots }) {
      return () => h('div', { role: 'menu' }, slots.default?.())
    }
  }),
  TxDropdownItem: defineComponent({
    name: 'TxDropdownItem',
    props: { danger: { type: Boolean, default: false } },
    emits: ['select'],
    setup(_props, { slots }) {
      return () => h('div', { 'data-menu-action': '' }, slots.default?.())
    }
  })
}))

/** The three actions that hand the provider record to the clipboard, the share sheet or a file. */
const CONFIG_EXPORT_ACTIONS = [
  'settings.intelligence.copyProviderConfig',
  'settings.intelligence.shareProviderConfig',
  'settings.intelligence.exportProviderConfig'
]

function createProvider(
  overrides: Partial<IntelligenceProviderConfig>
): IntelligenceProviderConfig {
  return {
    id: 'custom-openai',
    type: IntelligenceProviderType.OPENAI,
    name: 'Custom OpenAI',
    enabled: true,
    ...overrides
  }
}

function mountHeader(provider: IntelligenceProviderConfig): VueWrapper {
  return mount(IntelligenceProviderHeader, { props: { provider } })
}

/** The labels of the actions the menu actually renders, in template order. */
function menuActions(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[data-menu-action]').map((item) => item.text())
}

describe('IntelligenceProviderHeader action menu', () => {
  it('keeps only the copy-ID action for the official Nexus channel', () => {
    const wrapper = mountHeader(
      createProvider({
        id: 'tuff-nexus-default',
        name: 'Tuff Nexus',
        metadata: { origin: 'tuff-nexus' }
      })
    )

    expect(menuActions(wrapper)).toEqual(['settings.intelligence.copyProvider'])
  })

  it.each(CONFIG_EXPORT_ACTIONS)(
    'offers %s for an ordinary provider so its config can still be exported',
    (action) => {
      const wrapper = mountHeader(
        createProvider({ id: 'dashscope', name: 'DashScope', metadata: { origin: 'user' } })
      )

      expect(menuActions(wrapper)).toContain(action)
    }
  )
})
