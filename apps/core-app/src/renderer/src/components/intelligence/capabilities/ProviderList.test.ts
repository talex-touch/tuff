// @vitest-environment jsdom
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import {
  ON_DEVICE_ASR_CHANNEL_TYPE,
  TUFF_LOCAL_ASR_PROVIDER_ID
} from '@talex-touch/utils/intelligence/voice-asr'
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import {
  isNexusManagedProvider,
  TUFF_NEXUS_PROVIDER_ID,
  TUFF_NEXUS_PROVIDER_ORIGIN
} from '~/modules/intelligence/nexus-provider'
import { getProviderChannelType } from '~/modules/intelligence/provider-channel-type'
import { providerIconForChannel } from '~/modules/intelligence/provider-icons'
import { providerModelIds } from '@talex-touch/utils/intelligence/model-binding'
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
    emits: ['change'],
    // A row routes this event into `handleProviderToggle`, so the stub has to be the control that
    // raises it rather than a decorative span.
    template: `<button type="button" class="channel-switch" @click="$emit('change', !modelValue)" />`
  }
}))

const OFFICIAL_BADGE = '.provider-list__official'

/** A channel on the Bailian adapter, which has its own mark and its own type label. */
const bailianChannel: IntelligenceProviderConfig = {
  id: 'dashscope',
  name: 'DashScope',
  type: IntelligenceProviderType.CUSTOM,
  baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
  enabled: true,
  models: [{ id: 'qwen-audio-3.0-asr-flash' }],
  capabilities: ['audio.asr']
}

const nexusChannel: IntelligenceProviderConfig = {
  id: TUFF_NEXUS_PROVIDER_ID,
  name: 'Tuff Nexus',
  type: IntelligenceProviderType.CUSTOM,
  baseUrl: 'https://nexus.example.com/v1',
  enabled: true,
  models: [{ id: 'nexus-default' }],
  capabilities: ['audio.asr'],
  metadata: { origin: TUFF_NEXUS_PROVIDER_ORIGIN }
}

function bind(provider: IntelligenceProviderConfig, enabled = true): CapabilityBinding {
  return {
    providerId: provider.id,
    enabled,
    priority: 1,
    // The capability binding carries the provider's model ids, not its stored bindings.
    models: providerModelIds(provider),
    provider
  }
}

/** A speech channel the user configured themselves, on the Bailian adapter. */
const bailianAsrBinding: CapabilityBinding = {
  ...bind(bailianChannel),
  providerId: 'dashscope-asr',
  provider: {
    ...bailianChannel,
    metadata: { channelType: 'bailian', voiceAsr: { protocol: 'bailian-paraformer' } }
  }
}

/** The dictation channel main seeds on this machine — stored exactly as the program owns it. */
const onDeviceChannel: IntelligenceProviderConfig = {
  id: TUFF_LOCAL_ASR_PROVIDER_ID,
  type: IntelligenceProviderType.CUSTOM,
  name: 'Local Speech',
  enabled: true,
  capabilities: ['audio.asr'],
  models: [{ id: 'sense-voice-small' }],
  defaultModel: 'sense-voice-small',
  metadata: {
    channelType: ON_DEVICE_ASR_CHANNEL_TYPE,
    voiceAsr: { protocol: 'local-offline' }
  }
}

const onDeviceBinding: CapabilityBinding = { ...bind(onDeviceChannel), priority: 2 }

function rowFor(wrapper: VueWrapper, title: string) {
  const row = wrapper
    .findAll('.TBlockSlot-Container')
    .find((candidate) => candidate.find('h5').exists() && candidate.get('h5').text() === title)
  if (!row) throw new Error(`no provider row titled "${title}"`)
  return row
}

/** The titles of the rows the list actually drew, in template order. */
function rowTitles(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('.TBlockSlot-Container')
    .map((row) => (row.find('h5').exists() ? row.get('h5').text() : ''))
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

    wrapper.unmount()
  })

  it('falls back to the providerId when a binding outlived its provider record', () => {
    const wrapper = mountProviderList([], [{ providerId: 'orphan-channel', enabled: false }])

    const row = rowFor(wrapper, 'orphan-channel')

    expect(row.get('h5').text()).toBe('orphan-channel')
    expect(row.get('p').text()).toBe('orphan-channel')

    wrapper.unmount()
  })
})

/**
 * The on-device dictation channel is seeded and bound by main from the speech models already on
 * this machine: no endpoint, no credential, nothing the user can configure. It is therefore not a
 * row — but it *is* one of `enabledBindings`, which is exactly what `reorder` writes back, so
 * hiding some other row must never take the program-owned route out of the stored config.
 */
describe('providerList program-owned on-device channel', () => {
  it('draws no row for it, yet a reorder taken from the rows still carries it', async () => {
    const wrapper = mountProviderList([bailianAsrBinding, onDeviceBinding])

    expect(rowTitles(wrapper)).toEqual(['DashScope'])

    await rowFor(wrapper, 'DashScope').get('button').trigger('click')

    const reorders = wrapper.emitted('reorder')
    expect(reorders).toHaveLength(1)

    const [nextBindings] = reorders?.[0] as [CapabilityBinding[]]
    expect(nextBindings.map((binding) => binding.providerId)).toEqual([TUFF_LOCAL_ASR_PROVIDER_ID])

    wrapper.unmount()
  })
})
