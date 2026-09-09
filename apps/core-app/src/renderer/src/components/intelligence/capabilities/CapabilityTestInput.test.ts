// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CapabilityTestInput from './CapabilityTestInput.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}))

describe('CapabilityTestInput binding-only capability tests', () => {
  it('emits no provider or model override when the saved binding owns the route', async () => {
    const wrapper = mount(CapabilityTestInput, {
      props: {
        capabilityId: 'audio.asr',
        bindingOnly: true,
        isTesting: false,
        disabled: false,
        enabledBindings: [
          {
            providerId: 'saved-asr-channel',
            models: ['paraformer-realtime-v2']
          }
        ]
      },
      global: {
        stubs: {
          IntelligencePromptSelector: { template: '<div />' }
        }
      }
    })

    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('select').exists()).toBe(false)

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('test')).toEqual([[{}]])
  })
})
