import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxCodeEditorToolbar from '../src/TxCodeEditorToolbar.vue'

describe('txCodeEditorToolbar', () => {
  it('emits action on click', async () => {
    const wrapper = mount(TxCodeEditorToolbar, {
      props: {
        actions: [{ key: 'format', label: 'Format' }],
      },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('action')?.[0][0]).toBe('format')
  })
})
