import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxChatComposer from '../src/TxChatComposer.vue'
import { ChatComposer } from '../index'

describe('txChatComposer', () => {
  it('renders textarea, attachments, and default actions', () => {
    const wrapper = mount(TxChatComposer, {
      props: {
        modelValue: 'Hello',
        placeholder: 'Ask anything',
        showAttachmentButton: true,
        attachmentButtonText: 'Upload',
        sendButtonText: 'Submit',
        attachments: [
          { id: 'a', label: 'spec.pdf', kind: 'pdf' },
          { id: 'b', label: 'image.png', kind: 'image', pending: true },
        ],
      },
    })

    expect(wrapper.find('textarea').element.value).toBe('Hello')
    expect(wrapper.find('textarea').attributes('placeholder')).toBe('Ask anything')
    expect(wrapper.findAll('.tx-chat-composer__attachment')).toHaveLength(2)
    expect(wrapper.findAll('.tx-chat-composer__attachment')[1].classes()).toContain('is-pending')
    expect(wrapper.text()).toContain('Upload')
    expect(wrapper.text()).toContain('Submit')
  })

  it('emits model updates and send payload with trimmed text', async () => {
    const wrapper = mount(TxChatComposer, {
      props: {
        modelValue: '  Send me  ',
      },
    })

    await wrapper.find('textarea').setValue('Next')
    await wrapper.findAllComponents({ name: 'TxButton' }).at(-1)?.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Next'])
    expect(wrapper.emitted('send')?.[0]).toEqual([{ text: 'Send me' }])
  })

  it('supports keyboard send modes', async () => {
    const meta = mount(TxChatComposer, {
      props: {
        modelValue: 'Meta send',
        sendOnMetaEnter: true,
      },
    })

    await meta.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(meta.emitted('send')).toBeUndefined()
    await meta.find('textarea').trigger('keydown', { key: 'Enter', metaKey: true })
    expect(meta.emitted('send')?.[0]).toEqual([{ text: 'Meta send' }])

    const plain = mount(TxChatComposer, {
      props: {
        modelValue: 'Plain send',
        sendOnMetaEnter: false,
      },
    })

    await plain.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(plain.emitted('send')).toBeUndefined()
    await plain.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(plain.emitted('send')?.[0]).toEqual([{ text: 'Plain send' }])
  })

  it('blocks send while disabled, submitting, or empty without attachment allowance', async () => {
    const disabled = mount(TxChatComposer, {
      props: {
        modelValue: 'Blocked',
        disabled: true,
      },
    })
    await disabled.findAllComponents({ name: 'TxButton' }).at(-1)?.trigger('click')
    expect(disabled.emitted('send')).toBeUndefined()

    const submitting = mount(TxChatComposer, {
      props: {
        modelValue: 'Blocked',
        submitting: true,
      },
    })
    await submitting.findAllComponents({ name: 'TxButton' }).at(-1)?.trigger('click')
    expect(submitting.emitted('send')).toBeUndefined()

    const empty = mount(TxChatComposer, {
      props: {
        modelValue: '   ',
      },
    })
    await empty.findAllComponents({ name: 'TxButton' }).at(-1)?.trigger('click')
    expect(empty.emitted('send')).toBeUndefined()
  })

  it('allows attachment-only send when explicitly enabled', async () => {
    const wrapper = mount(TxChatComposer, {
      props: {
        modelValue: '',
        allowEmptySend: true,
        attachments: [{ id: 'a', label: 'context.txt' }],
      },
    })

    await wrapper.findAllComponents({ name: 'TxButton' }).at(-1)?.trigger('click')

    expect(wrapper.emitted('send')?.[0]).toEqual([{ text: '' }])
  })

  it('guards attachment click while disabled or submitting by default', async () => {
    const disabled = mount(TxChatComposer, {
      props: {
        showAttachmentButton: true,
        disabled: true,
      },
    })
    await disabled.findAllComponents({ name: 'TxButton' })[0].trigger('click')
    expect(disabled.emitted('attachmentClick')).toBeUndefined()

    const submitting = mount(TxChatComposer, {
      props: {
        showAttachmentButton: true,
        submitting: true,
      },
    })
    await submitting.findAllComponents({ name: 'TxButton' })[0].trigger('click')
    expect(submitting.emitted('attachmentClick')).toBeUndefined()

    const allowed = mount(TxChatComposer, {
      props: {
        showAttachmentButton: true,
        submitting: true,
        allowAttachmentWhileSubmitting: true,
      },
    })
    await allowed.findAllComponents({ name: 'TxButton' })[0].trigger('click')
    expect(allowed.emitted('attachmentClick')).toHaveLength(1)
  })

  it('forwards scoped slots and native textarea events', async () => {
    const wrapper = mount(TxChatComposer, {
      props: {
        modelValue: 'Slot send',
        attachments: [{ id: 'a', label: 'file.txt' }],
      },
      slots: {
        attachments: '<template #attachments="{ attachments }"><div class="custom-attachments">{{ attachments.length }}</div></template>',
        toolbar: '<template #toolbar="{ send, disabled, attachmentClick }"><button class="custom-send" :data-disabled="disabled" @click="send()">Send</button><button class="custom-attach" @click="attachmentClick()">Attach</button></template>',
        footer: '<div class="custom-footer">Footer</div>',
      },
    })

    await wrapper.find('textarea').trigger('focus')
    await wrapper.find('textarea').trigger('blur')
    await wrapper.find('textarea').trigger('paste')
    await wrapper.find('.custom-send').trigger('click')
    await wrapper.find('.custom-attach').trigger('click')

    expect(wrapper.find('.custom-attachments').text()).toBe('1')
    expect(wrapper.find('.custom-footer').text()).toBe('Footer')
    expect(wrapper.emitted('focus')).toHaveLength(1)
    expect(wrapper.emitted('blur')).toHaveLength(1)
    expect(wrapper.emitted('paste')).toHaveLength(1)
    expect(wrapper.emitted('send')?.[0]).toEqual([{ text: 'Slot send' }])
    expect(wrapper.emitted('attachmentClick')).toHaveLength(1)
  })

  it('caps textarea height at maxRows via a CSS variable (maxRows was previously unbound)', () => {
    const wrapper = mount(TxChatComposer, {
      props: {
        minRows: 3,
        maxRows: 8,
      },
    })

    const style = wrapper.find('textarea').attributes('style') ?? ''
    expect(style).toContain('--tx-chat-composer-max-rows: 8')
  })

  it('floors the maxRows cap at minRows so the ceiling never drops below the resting height', () => {
    const wrapper = mount(TxChatComposer, {
      props: {
        minRows: 5,
        maxRows: 2,
      },
    })

    const style = wrapper.find('textarea').attributes('style') ?? ''
    expect(style).toContain('--tx-chat-composer-max-rows: 5')
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    ChatComposer.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxChatComposer', ChatComposer)
  })

  it('names the textarea, defaulting to the placeholder, so it is never unnamed', () => {
    // Pre-fix the textarea had only a placeholder and no aria-label; default
    // fallthrough routed any host aria-label onto the root div instead.
    const fallback = mount(TxChatComposer, {
      props: { placeholder: 'Ask anything' },
    })
    expect(fallback.find('textarea').attributes('aria-label')).toBe('Ask anything')

    const explicit = mount(TxChatComposer, {
      props: { placeholder: 'Ask anything', ariaLabel: '消息输入框' },
    })
    expect(explicit.find('textarea').attributes('aria-label')).toBe('消息输入框')
  })
})
