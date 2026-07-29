import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxChatMessage from '../src/TxChatMessage.vue'

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
