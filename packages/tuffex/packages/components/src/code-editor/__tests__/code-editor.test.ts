import { getSearchQuery } from '@codemirror/search'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxCodeEditor from '../src/TxCodeEditor.vue'
import { nextTick } from 'vue'

async function mountCodeEditor(options: Parameters<typeof mount>[1]) {
  const wrapper = mount(TxCodeEditor, options)
  await vi.dynamicImportSettled()
  await flushPromises()
  await nextTick()
  await nextTick()
  await vi.dynamicImportSettled()
  await flushPromises()
  return wrapper
}

describe('txCodeEditor', () => {
  it('emits update on change', async () => {
    const wrapper = await mountCodeEditor({
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

  it('formats json', async () => {
    const wrapper = await mountCodeEditor({
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

  it('formats yaml', async () => {
    const wrapper = await mountCodeEditor({
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

  it('mounts toml and ini language modes with local stream parsers', async () => {
    const tomlWrapper = await mountCodeEditor({
      props: {
        modelValue: '[server]\nport = 8080',
        language: 'toml',
      },
    })
    const iniWrapper = await mountCodeEditor({
      props: {
        modelValue: '[server]\nport=8080',
        language: 'ini',
      },
    })

    expect((tomlWrapper.vm as { getValue: () => string }).getValue()).toContain('port')
    expect((iniWrapper.vm as { getValue: () => string }).getValue()).toContain('port')
  })

  it('renders search panel options with TxCheckbox and syncs SearchQuery', async () => {
    const wrapper = await mountCodeEditor({
      props: {
        modelValue: '{"id": "clipboard", "pin": true}',
      },
    })
    const vm = wrapper.vm as { openSearch: () => boolean, getView: () => any }
    expect(vm.openSearch()).toBe(true)
    await nextTick()

    expect(wrapper.findAll('input[type="checkbox"]').length).toBe(0)
    const checkboxes = wrapper.findAll('.cm-search .tx-checkbox[role="checkbox"]')
    expect(checkboxes.length).toBe(3)
    expect(checkboxes.map(item => item.text().trim())).toEqual(['match case', 'regexp', 'by word'])

    await checkboxes[2].trigger('click')
    await nextTick()
    expect(checkboxes[2].attributes('aria-checked')).toBe('true')
    expect(getSearchQuery(vm.getView().state).wholeWord).toBe(true)
  })

  it('switches to structured tree preview mode and toggles boolean via TxCheckbox', async () => {
    const sample = JSON.stringify({
      array: [1, 2, 3],
      enabled: true,
      color: 'gold',
      count: 123,
      meta: { a: 'b' },
    }, null, 2)

    const wrapper = await mountCodeEditor({
      props: {
        modelValue: sample,
        language: 'json',
        viewModeToggle: true,
      },
    })

    const modeButtons = wrapper.findAll('.tx-code-editor__mode-btn')
    expect(modeButtons).toHaveLength(2)
    await modeButtons[1]!.trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:viewMode')?.[0]).toEqual(['tree'])
    expect(wrapper.find('.tx-code-editor-tree').exists()).toBe(true)
    expect(wrapper.find('.tx-code-editor-tree-node__count').text()).toBe('3 items')
    expect(wrapper.find('.tx-code-editor-tree-node__swatch').exists()).toBe(true)

    const boolCheckbox = wrapper.find('.tx-code-editor-tree .tx-checkbox[role="checkbox"]')
    expect(boolCheckbox.attributes('aria-checked')).toBe('true')
    await boolCheckbox.trigger('click')
    await nextTick()

    const emitted = wrapper.emitted('update:modelValue')
    const latest = emitted?.[emitted.length - 1]?.[0] as string
    expect(JSON.parse(latest).enabled).toBe(false)
  })
})
