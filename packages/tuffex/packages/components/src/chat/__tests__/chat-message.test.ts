import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import TxChatList from '../src/TxChatList.vue'
import TxChatMessage from '../src/TxChatMessage.vue'

const voiceImportState = vi.hoisted(() => ({
  shouldFail: false,
}))

vi.mock('../../voice-clip', () => {
  if (voiceImportState.shouldFail)
    throw new Error('voice chunk unavailable')
  return {
    TxVoiceClip: {
      name: 'TxVoiceClip',
      props: ['src', 'durationMs', 'peaks'],
      setup(props: { src?: string }) {
        return () => h('div', { class: 'tx-voice-clip', 'data-src': props.src })
      },
    },
  }
})

function messageWith(attachments: Array<{ type: 'image', url: string, name?: string }>) {
  return {
    id: 'm1',
    role: 'user' as const,
    content: 'see attached',
    attachments,
  }
}

describe('txChatMessage attachment names', () => {
  it('gives every attachment thumbnail an accessible name, even without a filename', () => {
    const wrapper = mount(TxChatMessage, {
      props: {
        markdown: false,
        message: messageWith([
          { type: 'image', url: '/named.png', name: 'diagram.png' },
          { type: 'image', url: '/anon.png' },
        ]),
      },
    })

    const thumbs = wrapper.findAll('.tx-chat-message__thumb')
    // Named attachment: its filename names the button.
    expect(thumbs[0].attributes('aria-label')).toBe('diagram.png')
    // Unnamed attachment: pre-fix alt="" left the button with no accessible name.
    expect(thumbs[1].attributes('aria-label')).toBe('Open image attachment')
    // The image is decorative now — the button carries the name.
    expect(thumbs[1].find('img').attributes('alt')).toBe('')
  })

  it('honors a localized attachment fallback label', () => {
    const wrapper = mount(TxChatMessage, {
      props: {
        markdown: false,
        attachmentLabel: '打开图片附件',
        message: messageWith([{ type: 'image', url: '/anon.png' }]),
      },
    })

    expect(wrapper.find('.tx-chat-message__thumb').attributes('aria-label')).toBe('打开图片附件')
  })
})

describe('txChatList attachment names', () => {
  it.each([true, false])('forwards attachmentLabel to every message (stagger: %s)', (stagger) => {
    const wrapper = mount(TxChatList, {
      props: {
        markdown: false,
        stagger,
        attachmentLabel: '打开图片附件',
        messages: [messageWith([{ type: 'image', url: '/anon.png' }])],
      },
    })

    expect(wrapper.find('.tx-chat-message__thumb').attributes('aria-label')).toBe('打开图片附件')
  })

  it('keeps the message default when no label is passed', () => {
    const wrapper = mount(TxChatList, {
      props: {
        markdown: false,
        stagger: false,
        messages: [messageWith([{ type: 'image', url: '/anon.png' }])],
      },
    })

    expect(wrapper.find('.tx-chat-message__thumb').attributes('aria-label')).toBe('Open image attachment')
  })
})

describe('txChatMessage rich variants, status, and actions', () => {
  it('supports hybrid layout, metrics, error retry, and collapsible TxMessageActions', async () => {
    const wrapper = mount(TxChatMessage, {
      props: {
        markdown: false,
        variant: 'hybrid',
        copyable: true,
        regenerable: true,
        speakable: true,
        actions: 'always',
        message: {
          id: 'a1',
          role: 'assistant',
          content: 'Synthesized reply',
          status: 'error',
          error: 'Upstream timeout',
          metrics: '1.2s · 42 tok/s',
          attachments: [
            { id: 'f1', kind: 'file', name: 'report.csv', size: 1024 },
          ],
        },
      },
    })

    expect(wrapper.classes()).toContain('is-variant-hybrid')
    expect(wrapper.classes()).toContain('is-error')
    expect(wrapper.classes()).toContain('is-actions-always')
    // No fallback avatar rendered in hybrid mode unless avatarUrl/#avatar/showAvatar is set
    expect(wrapper.find('.tx-chat-message__avatar').exists()).toBe(false)
    expect(wrapper.find('.tx-chat-message__metrics').text()).toBe('1.2s · 42 tok/s')
    expect(wrapper.find('.tx-chat-message__error').text()).toContain('Upstream timeout')
    expect(wrapper.find('.tx-attachment-tray').exists()).toBe(true)

    await wrapper.find('.tx-chat-message__retry').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([['a1']])

    const actionButtons = wrapper.findAll('.tx-message-actions button')
    expect(actionButtons.length).toBeGreaterThanOrEqual(3)
    await wrapper.find('.tx-message-actions button[aria-label="Regenerate"]').trigger('click')
    expect(wrapper.emitted('regenerate')).toEqual([['a1']])
    await wrapper.find('.tx-message-actions button[aria-label="Read aloud"]').trigger('click')
    expect(wrapper.emitted('speak')).toEqual([['a1']])
  })

  it('shows pending typing dots when pending with empty content', () => {
    const wrapper = mount(TxChatMessage, {
      props: {
        markdown: false,
        message: {
          id: 'p1',
          role: 'assistant',
          content: '',
          status: 'pending',
        },
      },
    })

    expect(wrapper.classes()).toContain('is-pending')
    expect(wrapper.findAll('.tx-chat-message__typing i')).toHaveLength(3)
  })

  it('renders a native audio fallback and retry control when lazy TxVoiceClip loading fails', async () => {
    voiceImportState.shouldFail = true
    vi.resetModules()

    const wrapper = mount(TxChatMessage, {
      props: {
        markdown: false,
        retryLabel: 'Retry audio',
        message: {
          id: 'v1',
          role: 'user',
          content: '',
          voice: { src: 'blob:voice-1', durationMs: 4000 },
        },
      },
    })
    await flushPromises()

    const fallbackAudio = wrapper.find('.tx-chat-message__voice-audio')
    expect(fallbackAudio.exists()).toBe(true)
    expect(fallbackAudio.attributes('src')).toBe('blob:voice-1')
    expect(fallbackAudio.attributes('controls')).toBeDefined()

    const retryBtn = wrapper.find('.tx-chat-message__voice-fallback .tx-chat-message__retry')
    expect(retryBtn.text()).toBe('Retry audio')

    voiceImportState.shouldFail = false
    vi.resetModules()
    await retryBtn.trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.tx-voice-clip').exists()).toBe(true)
    expect(wrapper.find('.tx-voice-clip').attributes('data-src')).toBe('blob:voice-1')
    expect(wrapper.find('.tx-chat-message__voice-fallback').exists()).toBe(false)
  })
})
