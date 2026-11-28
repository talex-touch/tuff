import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAiConversation from '../components/conversation/TxAiConversation.vue'
import TxAiSuggestion from '../components/conversation/TxAiSuggestion.vue'
import TxAiRichBlock from '../components/content/TxAiRichBlock.vue'
import TxAiThinking from '../components/foundation/TxAiThinking.vue'
import TxAiCitation from '../components/tool-agent/TxAiCitation.vue'

describe('ai components', () => {
  it('renders thinking indicator', () => {
    const wrapper = mount(TxAiThinking, {
      props: {
        text: 'Generating',
        variant: 'dots',
      },
    })

    expect(wrapper.find('.tx-ai-thinking').exists()).toBe(true)
    expect(wrapper.text()).toContain('Generating')
  })

  it('emits selected suggestion text', async () => {
    const wrapper = mount(TxAiSuggestion, {
      props: {
        text: 'Explain this',
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual(['Explain this'])
  })

  it('renders conversation messages and stop action', async () => {
    const wrapper = mount(TxAiConversation, {
      props: {
        generating: true,
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            blocks: [{ type: 'text', content: 'hello' }],
          },
        ],
      },
      global: {
        stubs: {
          TxMarkdownView: true,
        },
      },
    })

    expect(wrapper.find('.tx-ai-conversation__list').text()).toContain('hello')

    await wrapper.find('.tx-ai-conversation__stop').trigger('click')

    expect(wrapper.emitted('stop')).toHaveLength(1)
  })

  it('drives thought expansion through auto sizer action', async () => {
    let actionCalls = 0
    const wrapper = mount(TxAiRichBlock, {
      props: {
        block: {
          type: 'card',
          content: 'thinking detail',
          status: 'success',
          meta: { kind: 'thought' },
        },
      },
      global: {
        stubs: {
          TxIcon: true,
          TxAiStreamText: true,
          TxAutoSizer: {
            name: 'TxAutoSizer',
            template: '<div class="auto-sizer"><slot /></div>',
            methods: {
              async action(fn: () => void) {
                actionCalls += 1
                fn()
              },
              async refresh() {},
            },
          },
        },
      },
    })

    expect(wrapper.find('.tx-ai-rich-block__thought').classes()).not.toContain('is-expanded')

    await wrapper.find('.tx-ai-rich-block__thought-header').trigger('click')
    expect(actionCalls).toBe(1)
    expect(wrapper.find('.tx-ai-rich-block__thought').classes()).toContain('is-expanded')

    await wrapper.find('.tx-ai-rich-block__thought-header').trigger('click')
    expect(actionCalls).toBe(2)
    expect(wrapper.find('.tx-ai-rich-block__thought').classes()).not.toContain('is-expanded')
  })

  it('validates TxAiCitation href protocols and enforces noopener noreferrer on external links', () => {
    const safe = mount(TxAiCitation, {
      props: { title: 'Docs', href: 'https://example.com/guide' },
    })
    const safeLink = safe.find('a.tx-ai-citation')
    expect(safeLink.exists()).toBe(true)
    expect(safeLink.attributes('href')).toBe('https://example.com/guide')
    expect(safeLink.attributes('rel')).toBe('noopener noreferrer')

    for (const badHref of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<h1>x</h1>']) {
      const unsafe = mount(TxAiCitation, {
        props: { title: 'Bad', href: badHref },
      })
      expect(unsafe.find('a').exists()).toBe(false)
      expect(unsafe.find('span.tx-ai-citation').exists()).toBe(true)
      expect(unsafe.find('span.tx-ai-citation').attributes('href')).toBeUndefined()
    }
  })

  it('filters unsafe image URLs in TxAiRichBlock and adds no-referrer policy', () => {
    const unsafe = mount(TxAiRichBlock, {
      props: {
        block: {
          type: 'image',
          content: 'file:///etc/passwd',
        },
      },
      global: { stubs: { TxIcon: true } },
    })
    expect(unsafe.find('img').exists()).toBe(false)

    const unsafeSvg = mount(TxAiRichBlock, {
      props: {
        block: {
          type: 'image',
          content: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        },
      },
      global: { stubs: { TxIcon: true } },
    })
    expect(unsafeSvg.find('img').exists()).toBe(false)

    const safe = mount(TxAiRichBlock, {
      props: {
        block: {
          type: 'image',
          content: 'https://cdn.example.com/pic.png',
        },
      },
      global: { stubs: { TxIcon: true } },
    })
    const img = safe.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://cdn.example.com/pic.png')
    expect(img.attributes('referrerpolicy')).toBe('no-referrer')
  })
})
