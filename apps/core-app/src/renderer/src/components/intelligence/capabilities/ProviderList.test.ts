// @vitest-environment jsdom
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import {
  isNexusManagedProvider,
  TUFF_NEXUS_PROVIDER_ID,
  TUFF_NEXUS_PROVIDER_ORIGIN
} from '~/modules/intelligence/nexus-provider'
import { getProviderChannelType } from '~/modules/intelligence/provider-channel-type'
import { providerIconForChannel } from '~/modules/intelligence/provider-icons'
import type { CapabilityBinding } from './types'
import ProviderList from './ProviderList.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@talex-touch/tuffex/switch', () => ({
  TxSwitch: {
    name: 'TxSwitch',
    props: ['modelValue'],
    template: '<span class="channel-switch" />'
  }
}))

const OFFICIAL_BADGE = '.provider-list__official'
/** The glyph a row falls back to when its provider record is gone. */
const FALLBACK_ICON = 'i-carbon-api-1'

/** A channel on the Bailian adapter, which has its own mark and its own type label. */
const bailianChannel: IntelligenceProviderConfig = {
  id: 'dashscope',
  name: 'DashScope',
  type: IntelligenceProviderType.CUSTOM,
  baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
  enabled: true,
  models: ['qwen-audio-3.0-asr-flash'],
  capabilities: ['audio.asr']
}

const nexusChannel: IntelligenceProviderConfig = {
  id: TUFF_NEXUS_PROVIDER_ID,
  name: 'Tuff Nexus',
  type: IntelligenceProviderType.CUSTOM,
  baseUrl: 'https://nexus.example.com/v1',
  enabled: true,
  models: ['nexus-default'],
  capabilities: ['audio.asr'],
  metadata: { origin: TUFF_NEXUS_PROVIDER_ORIGIN }
}

function bind(provider: IntelligenceProviderConfig, enabled = true): CapabilityBinding {
  return {
    providerId: provider.id,
    enabled,
    priority: 1,
    models: provider.models ?? [],
    provider
  }
}

function rowFor(wrapper: VueWrapper, title: string) {
  const row = wrapper
    .findAll('.TBlockSlot-Container')
    .find((candidate) => candidate.find('h5').exists() && candidate.get('h5').text() === title)
  if (!row) throw new Error(`no provider row titled "${title}"`)
  return row
}

function mountProviderList(
  enabledBindings: CapabilityBinding[],
  disabledBindings: CapabilityBinding[] = []
) {
  return mount(ProviderList, {
    props: { capabilityId: 'audio.asr', enabledBindings, disabledBindings }
  })
}

describe('providerList channel rows', () => {
  it('names the channel and labels the adapter it runs on, with that adapter mark', () => {
    const wrapper = mountProviderList([bind(bailianChannel)])

    const row = rowFor(wrapper, 'DashScope')
    const channelType = getProviderChannelType(bailianChannel)

    expect(row.get('h5').text()).toBe('DashScope')
    expect(row.get('p').text()).toBe(`settings.intelligence.providerTypeOptions.${channelType}`)
    expect(row.get('i').classes()).toContain(
      providerIconForChannel(channelType, bailianChannel.type).value
    )

    wrapper.unmount()
  })

  it('marks the Nexus-managed channel — and only that channel — as official', () => {
    const wrapper = mountProviderList([bind(bailianChannel), bind(nexusChannel)])

    for (const provider of [bailianChannel, nexusChannel]) {
      const row = rowFor(wrapper, provider.name)
      expect(row.find(OFFICIAL_BADGE).exists()).toBe(isNexusManagedProvider(provider))
    }

    expect(rowFor(wrapper, 'Tuff Nexus').get(OFFICIAL_BADGE).text()).toContain(
      'intelligence.item.nexusOfficial'
    )

    wrapper.unmount()
  })

  it('falls back to the providerId when a binding outlived its provider record', () => {
    const wrapper = mountProviderList([], [{ providerId: 'orphan-channel', enabled: false }])

    const row = rowFor(wrapper, 'orphan-channel')

    expect(row.get('h5').text()).toBe('orphan-channel')
    expect(row.get('p').text()).toBe('orphan-channel')
    expect(row.get('i').classes()).toContain(FALLBACK_ICON)

    wrapper.unmount()
  })
})
