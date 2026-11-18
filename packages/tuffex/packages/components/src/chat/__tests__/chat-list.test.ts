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

  it('scrolls to indexed items in list mode even when custom item/message slots omit .tx-chat-message', () => {
    const wrapper = mount(TxChatList, {
      props: {
        mode: 'list',
        stagger: false,
        messages: [
          { id: 'm0', role: 'user', content: 'First' },
          { id: 'm1', role: 'assistant', content: 'Second' },
          { id: 'm2', role: 'user', content: 'Third' },
        ],
      },
      slots: {
        item: '<template #item="{ message }"><article class="custom-row">{{ message.content }}</article></template>',
      },
    })

    expect(wrapper.find('.tx-chat-message').exists()).toBe(false)
    const anchors = wrapper.findAll('.tx-chat-list__item')
    expect(anchors).toHaveLength(3)

    const scrollSpy = vi.fn()
    ;(anchors[1]!.element as HTMLElement).scrollIntoView = scrollSpy

    const vm = wrapper.vm as unknown as { scrollToIndex: (index: number) => void }
    vm.scrollToIndex(1)
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'start' })
  })
})
