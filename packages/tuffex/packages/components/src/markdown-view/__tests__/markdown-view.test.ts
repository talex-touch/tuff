import { flushPromises, mount } from '@vue/test-utils'
import { marked } from 'marked'
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

  it('loads the sanitizer when sanitize is enabled after mount', async () => {
    const wrapper = mount(TxMarkdownView, {
      props: {
        sanitize: false,
        content: '# Title\n\n<script>alert(1)</script>',
      },
    })

    // Raw html is shown while sanitize is off.
    expect(wrapper.find('.markdown-body').find('h1').text()).toBe('Title')

    await wrapper.setProps({ sanitize: true })
    await flushSanitizer()

    const body = wrapper.find('.markdown-body')

    expect(body.find('h1').text()).toBe('Title')
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

  it('tracks auto theme when dark mode is toggled on <body>', async () => {
    const wrapper = mount(TxMarkdownView, {
      props: {
        sanitize: false,
        theme: 'auto',
        content: 'auto',
      },
    })

    await nextTick()
    expect(wrapper.classes()).toContain('light')

    // resolveAutoTheme reads <body> too, so the observer has to watch it as well.
    document.body.classList.add('dark')
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()

    expect(wrapper.classes()).toContain('dark')
    expect(wrapper.attributes('data-theme')).toBe('dark')
  })

  it('does not mutate the shared global marked singleton', async () => {
    const setOptionsSpy = vi.spyOn(marked, 'setOptions')

    const wrapper = mount(TxMarkdownView, {
      props: { sanitize: false, content: 'line one\nline two' },
    })
    await flushSanitizer()

    // The per-instance parser must not reconfigure the app-wide `marked` singleton.
    expect(setOptionsSpy).not.toHaveBeenCalled()
    // ...while still applying its own gfm/breaks (a single newline becomes <br>).
    expect(wrapper.find('.markdown-body').html()).toContain('<br')

    setOptionsSpy.mockRestore()
  })
})
