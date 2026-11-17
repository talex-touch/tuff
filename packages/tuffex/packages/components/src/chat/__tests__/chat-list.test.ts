import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxChatList from '../src/TxChatList.vue'

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('IntersectionObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('txChatList stream delegation', () => {
  it('delegates to TxConversationStream in stream mode and exposes stream controls', async () => {
    const wrapper = mount(TxChatList, {
      props: {
        mode: 'stream',
        markdown: false,
        streaming: true,
        messageVariant: 'hybrid',
        copyable: true,
        regenerable: true,
        bottomClearance: 100,
        messages: [
          { id: 'u1', role: 'user', content: 'Hi' },
          { id: 'a1', role: 'assistant', content: 'Working...', status: 'streaming' },
        ],
      },
      slots: {
        rail: '<div class="custom-rail">rail</div>',
      },
    })

    await nextTick()
    expect(wrapper.find('.tx-conversation-stream').exists()).toBe(true)
    expect(wrapper.find('.custom-rail').text()).toBe('rail')
    expect(wrapper.findAll('.tx-chat-message')).toHaveLength(2)
    expect(wrapper.find('.tx-chat-message--assistant').classes()).toContain('is-streaming')
    expect(wrapper.find('.tx-chat-message--user').classes()).toContain('is-variant-hybrid')

    const vm = wrapper.vm as unknown as {
      scrollToBottom: (behavior?: ScrollBehavior) => void
      scrollToIndex: (index: number) => void
      tweenToBottom: (duration?: number) => Promise<boolean>
      atBottom: boolean
      following: boolean
    }
    expect(typeof vm.scrollToBottom).toBe('function')
    expect(typeof vm.scrollToIndex).toBe('function')
    expect(typeof vm.tweenToBottom).toBe('function')
    expect(vm.atBottom).toBe(true)
    expect(vm.following).toBe(true)
  })

  it('renders emptyText when messages is empty', () => {
    const wrapper = mount(TxChatList, {
      props: {
        messages: [],
        emptyText: 'Start a conversation',
      },
    })
    expect(wrapper.find('.tx-chat-list__empty').text()).toBe('Start a conversation')
  })
})
