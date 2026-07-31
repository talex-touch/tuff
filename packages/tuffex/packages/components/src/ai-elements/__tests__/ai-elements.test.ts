import type { AiElementMessage } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAiConversation from '../src/TxAiConversation.vue'
import TxAiMessage from '../src/TxAiMessage.vue'

const messages: AiElementMessage[] = [
  { id: '1', role: 'assistant', content: 'Hello there' },
]

describe('txAiConversation', () => {
  it('forwards the default and avatar slots down to each message', () => {
    const wrapper = mount(TxAiConversation, {
      props: { messages, showAvatar: true, markdown: false },
      slots: {
        default: '<span class="custom-body">CUSTOM BODY</span>',
        avatar: '<span class="custom-avatar">CA</span>',
      },
    })

    // Without slot forwarding these are unreachable through the conversation, which
    // is the only documented entry point.
    expect(wrapper.find('.custom-body').text()).toBe('CUSTOM BODY')
    expect(wrapper.find('.custom-avatar').text()).toBe('CA')
  })

  it('keeps the built-in message rendering when no slots are provided', () => {
    const wrapper = mount(TxAiConversation, {
      props: { messages, markdown: false },
    })

    expect(wrapper.text()).toContain('Hello there')
  })
})

describe('txAiMessage accessible names', () => {
  it('exposes the typing indicator as a labelled status region', () => {
    const wrapper = mount(TxAiMessage, {
      props: {
        message: { id: '1', role: 'assistant', content: '', status: 'streaming' },
        markdown: false,
      },
    })

    const typing = wrapper.find('.tx-ai-message__typing')
    // Pre-fix the aria-label sat on a role-less <div> and was ignored by AT.
    expect(typing.exists()).toBe(true)
    expect(typing.attributes('role')).toBe('status')
    expect(typing.attributes('aria-label')).toBe('AI is typing')
  })

  it('keeps a custom avatar slot in the accessibility tree', () => {
    const wrapper = mount(TxAiMessage, {
      props: {
        message: { id: '1', role: 'assistant', content: 'hi', status: 'complete' },
        showAvatar: true,
        markdown: false,
      },
      slots: {
        avatar: '<button class="custom-avatar">Profile</button>',
      },
    })

    // Pre-fix the whole wrapper was aria-hidden, removing the interactive slot
    // from AT; only the built-in decorative fallback should be hidden.
    expect(wrapper.find('.tx-ai-message__avatar').attributes('aria-hidden')).toBeUndefined()
    expect(wrapper.find('.custom-avatar').exists()).toBe(true)
  })
})
