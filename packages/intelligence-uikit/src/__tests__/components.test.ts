import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAiConversation from '../components/conversation/TxAiConversation.vue'
import TxAiSuggestion from '../components/conversation/TxAiSuggestion.vue'
import TxAiRichBlock from '../components/content/TxAiRichBlock.vue'
import TxAiThinking from '../components/foundation/TxAiThinking.vue'

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
})
