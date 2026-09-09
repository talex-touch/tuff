// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CapabilityModelTransfer from './CapabilityModelTransfer.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

const availableModels = Array.from({ length: 249 }, (_, index) =>
  index === 7 ? 'qwen-audio-3.0-asr-flash' : `model-${index}`
)

function mountTransfer(modelValue: string[] = []) {
  return mount(CapabilityModelTransfer, {
    props: {
      modelValue,
      availableModels,
      scopeKey: 'dashscope',
      disabled: false
    }
  })
}

describe('capabilityModelTransfer', () => {
  it('emits the added model after checking a filtered row and pressing add', async () => {
    const wrapper = mountTransfer()

    const filters = wrapper.findAll('.tx-transfer__filter input')
    await filters[0].setValue('qwen-a')

    const rows = wrapper.findAll('.tx-transfer__panel')[0].findAll('.tx-transfer__item')
    expect(rows).toHaveLength(1)

    await rows[0].find('.tx-checkbox').trigger('click')
    await wrapper.find('.tx-transfer__actions button').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['qwen-audio-3.0-asr-flash'])
  })

  it('keeps a bound model in the target panel when the parent echoes the update back', async () => {
    const wrapper = mountTransfer(['qwen-audio-3.0-asr-flash'])

    const targetPanel = wrapper.findAll('.tx-transfer__panel')[1]
    expect(targetPanel.text()).toContain('qwen-audio-3.0-asr-flash')
  })

  it('survives the parent re-passing fresh prop identities between check and add', async () => {
    // The capability page rebuilds `bindings` on every render, so modelValue and
    // availableModels arrive as new arrays while the dialog stays open.
    const wrapper = mountTransfer()

    const filters = wrapper.findAll('.tx-transfer__filter input')
    await filters[0].setValue('qwen-a')
    await wrapper.find('.tx-transfer__item .tx-checkbox').trigger('click')

    await wrapper.setProps({ modelValue: [], availableModels: [...availableModels] })

    await wrapper.find('.tx-transfer__actions button').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['qwen-audio-3.0-asr-flash'])
  })
})
