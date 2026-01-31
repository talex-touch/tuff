import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxCodeEditor from '../src/TxCodeEditor.vue'

describe('txCodeEditor', () => {
  it('emits update on change', async () => {
    const wrapper = mount(TxCodeEditor, {
      props: {
        modelValue: '{"a":1}',
      },
    })
    const view = (wrapper.vm as { getView: () => any }).getView()
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '{"a":2}' },
    })
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[0][0]).toBe('{"a":2}')
  })

  it('formats json', () => {
    const wrapper = mount(TxCodeEditor, {
      props: {
        modelValue: '{"a":1,"b":2}',
      },
    })
    const vm = wrapper.vm as { format: () => boolean }
    const formatted = vm.format()
    expect(formatted).toBe(true)
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[emitted.length - 1][0]).toBe('{\n  \"a\": 1,\n  \"b\": 2\n}')
  })

  it('formats yaml', () => {
    const wrapper = mount(TxCodeEditor, {
      props: {
        modelValue: 'a: 1\nb: 2',
        language: 'yaml',
      },
    })
    const vm = wrapper.vm as { format: () => boolean }
    const formatted = vm.format()
    expect(formatted).toBe(true)
    const emitted = wrapper.emitted('update:modelValue')
    const value = emitted?.[emitted.length - 1][0]
    expect(value).toContain('a: 1')
    expect(value).toContain('b: 2')
  })
})
