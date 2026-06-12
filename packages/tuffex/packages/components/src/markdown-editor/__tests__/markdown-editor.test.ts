import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as components from '../../index'
import TxMarkdownEditor from '../src/TxMarkdownEditor.vue'

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, ''),
  },
}))

async function flushMarkdown() {
  await flushPromises()
  await nextTick()
}

describe('txMarkdownEditor', () => {
  it('exports component for full and on-demand imports', () => {
    expect(components.TxMarkdownEditor).toBeTruthy()
    expect(components.MarkdownEditor).toBeTruthy()
  })

  it('renders markdown in wysiwyg mode and sanitizes html', async () => {
    const wrapper = mount(TxMarkdownEditor, {
      props: {
        modelValue: '# Title\n\n<script>alert(1)</script>',
      },
    })

    await flushMarkdown()

    expect(wrapper.find('.tx-markdown-editor__surface h1').text()).toBe('Title')
    expect(wrapper.html()).not.toContain('<script>')
  })

  it('updates model value from source mode input', async () => {
    const wrapper = mount(TxMarkdownEditor, {
      props: {
        modelValue: 'Initial',
        defaultMode: 'source',
      },
    })

    const source = wrapper.find('textarea')
    await source.setValue('**Changed**')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['**Changed**'])
    expect(wrapper.emitted('change')?.at(-1)).toEqual(['**Changed**'])
  })

  it('emits mode changes for uncontrolled mode', async () => {
    const wrapper = mount(TxMarkdownEditor, {
      props: {
        modelValue: 'Content',
      },
    })

    const previewButton = wrapper.findAll('.tx-markdown-editor__modes button')[2]
    await previewButton.trigger('click')
    await flushMarkdown()

    expect(wrapper.emitted('update:mode')?.at(-1)).toEqual(['preview'])
    expect(wrapper.emitted('mode-change')?.at(-1)).toEqual(['preview'])
    expect(wrapper.find('.tx-markdown-editor__preview').isVisible()).toBe(true)
  })

  it('serializes rich editing content back to markdown', async () => {
    const wrapper = mount(TxMarkdownEditor, {
      props: {
        modelValue: '',
        sanitize: false,
      },
      attachTo: document.body,
    })

    await flushMarkdown()

    const surface = wrapper.find('.tx-markdown-editor__surface')
    surface.element.innerHTML = '<h2>Heading</h2><p><strong>Bold</strong> text</p><ul><li>Item</li></ul>'
    await surface.trigger('input')

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toContain('## Heading')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toContain('**Bold** text')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toContain('- Item')

    wrapper.unmount()
  })
})
