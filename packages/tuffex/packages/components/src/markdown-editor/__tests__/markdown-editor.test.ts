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

    const modeButtons = wrapper.findAll('.tx-markdown-editor__modes button')
    const previewButton = modeButtons[2]
    await previewButton.trigger('click')
    await flushMarkdown()

    expect(wrapper.emitted('update:mode')?.at(-1)).toEqual(['preview'])
    expect(wrapper.emitted('mode-change')?.at(-1)).toEqual(['preview'])
    expect(wrapper.find('.tx-markdown-editor__preview').isVisible()).toBe(true)
    // The mode switcher is a toggle group: the active mode is aria-pressed, not a
    // role="tab" (there are no associated tabpanels to complete a tablist).
    expect(wrapper.find('.tx-markdown-editor__modes').attributes('role')).toBe('group')
    expect(previewButton.attributes('aria-pressed')).toBe('true')
    expect(modeButtons[0].attributes('aria-pressed')).toBe('false')
    expect(previewButton.attributes('role')).toBeUndefined()
  })

  it('reacts to a dark-mode toggle on document.body, not just documentElement', async () => {
    document.documentElement.classList.remove('dark')
    document.body.classList.remove('dark')

    const wrapper = mount(TxMarkdownEditor, {
      props: {
        modelValue: '',
        theme: 'auto',
      },
    })
    await flushMarkdown()
    expect(wrapper.attributes('data-theme')).toBe('light')

    // resolveAutoTheme reads <body> too; the observer must watch it or this is ignored.
    document.body.classList.add('dark')
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(wrapper.attributes('data-theme')).toBe('dark')

    document.body.classList.remove('dark')
    wrapper.unmount()
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

  it('names both editing surfaces so neither announces as an unnamed textbox', async () => {
    const wrapper = mount(TxMarkdownEditor, {
      props: { modelValue: 'x', ariaLabel: 'Notes editor' },
    })
    await flushMarkdown()

    // Pre-fix the role="textbox" WYSIWYG surface and the source <textarea> were
    // both unnamed; they now share the localizable ariaLabel.
    expect(wrapper.find('.tx-markdown-editor__surface').attributes('aria-label')).toBe('Notes editor')
    expect(wrapper.find('textarea').attributes('aria-label')).toBe('Notes editor')
  })
})
