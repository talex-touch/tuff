import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxMarkdownView from '../src/TxMarkdownView.vue'

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, ''),
  },
}))

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.className = ''
  document.body.removeAttribute('data-theme')
  document.body.className = ''
})

async function flushSanitizer() {
  await flushPromises()
  await nextTick()
}

describe('txMarkdownView', () => {
  it('does not render raw html before sanitizer resolves', () => {
    const wrapper = mount(TxMarkdownView, {
      props: {
        content: '# Title\n\n<script>alert(1)</script>',
      },
    })

    expect(wrapper.find('.markdown-body').html()).not.toContain('<script>')
    expect(wrapper.find('.markdown-body').text()).toBe('')
  })

  it('renders sanitized markdown html when sanitize is enabled', async () => {
    const wrapper = mount(TxMarkdownView, {
      props: {
        content: '# Title\n\n- item\n\n<script>alert(1)</script>',
      },
    })

    await flushSanitizer()

    const body = wrapper.find('.markdown-body')

    expect(body.find('h1').text()).toBe('Title')
    expect(body.find('li').text()).toBe('item')
    expect(body.html()).not.toContain('<script>')
  })

  it('renders raw markdown html when sanitize is disabled', () => {
    const wrapper = mount(TxMarkdownView, {
      props: {
        sanitize: false,
        content: '# Title\n\n<script>alert(1)</script>',
      },
    })

    const body = wrapper.find('.markdown-body')

    expect(body.find('h1').text()).toBe('Title')
    expect(body.html()).toContain('<script>')
  })

  it('uses explicit light and dark themes', () => {
    const light = mount(TxMarkdownView, {
      props: {
        sanitize: false,
        theme: 'light',
        content: 'light',
      },
    })
    const dark = mount(TxMarkdownView, {
      props: {
        sanitize: false,
        theme: 'dark',
        content: 'dark',
      },
    })

    expect(light.classes()).toContain('light')
    expect(light.attributes('data-theme')).toBe('light')
    expect(dark.classes()).toContain('dark')
    expect(dark.attributes('data-theme')).toBe('dark')
  })

  it('resolves auto theme from document data-theme and updates through observer', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    const wrapper = mount(TxMarkdownView, {
      props: {
        sanitize: false,
        theme: 'auto',
        content: 'auto',
      },
    })

    await nextTick()

    expect(wrapper.classes()).toContain('dark')
    expect(wrapper.attributes('data-theme')).toBe('dark')

    document.documentElement.setAttribute('data-theme', 'light')
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()

    expect(wrapper.classes()).toContain('light')
    expect(wrapper.attributes('data-theme')).toBe('light')
  })

  it('falls back to light auto theme without document markers', () => {
    const wrapper = mount(TxMarkdownView, {
      props: {
        sanitize: false,
        theme: 'auto',
        content: 'auto',
      },
    })

    expect(wrapper.classes()).toContain('light')
    expect(wrapper.attributes('data-theme')).toBe('light')
  })
})
