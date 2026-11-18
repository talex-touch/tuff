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
    // Both default actions are icon-only; their text props are the accessible names.
    expect(wrapper.find('.tx-chat-composer__attach').attributes('aria-label')).toBe('Upload')
    expect(wrapper.find('.tx-chat-composer__send').attributes('aria-label')).toBe('Submit')
  })

  it('emits model updates and send payload with trimmed text', async () => {
    const wrapper = mount(TxChatComposer, {
      props: {
        modelValue: '  Send me  ',
      },
    })

    await wrapper.find('textarea').setValue('Next')
    await wrapper.find('.tx-chat-composer__send').trigger('click')

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
    // VTU skips `trigger` on a disabled element, so the disabled attribute is
    // asserted too — otherwise the no-send checks below would pass on their own.
    expect(disabled.find('.tx-chat-composer__send').attributes()).toHaveProperty('disabled')
    await disabled.find('.tx-chat-composer__send').trigger('click')
    expect(disabled.emitted('send')).toBeUndefined()

    const submitting = mount(TxChatComposer, {
      props: {
        modelValue: 'Blocked',
        submitting: true,
      },
    })
    expect(submitting.find('.tx-chat-composer__send').attributes()).toHaveProperty('disabled')
    await submitting.find('.tx-chat-composer__send').trigger('click')
    expect(submitting.emitted('send')).toBeUndefined()

    const empty = mount(TxChatComposer, {
      props: {
        modelValue: '   ',
      },
    })
    expect(empty.find('.tx-chat-composer__send').attributes()).toHaveProperty('disabled')
    await empty.find('.tx-chat-composer__send').trigger('click')
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

    await wrapper.find('.tx-chat-composer__send').trigger('click')

    expect(wrapper.emitted('send')?.[0]).toEqual([{ text: '' }])
  })

  it('guards attachment click while disabled or submitting by default', async () => {
    const disabled = mount(TxChatComposer, {
      props: {
        showAttachmentButton: true,
        disabled: true,
      },
    })
    await disabled.find('.tx-chat-composer__attach').trigger('click')
    expect(disabled.emitted('attachmentClick')).toBeUndefined()

    const submitting = mount(TxChatComposer, {
      props: {
        showAttachmentButton: true,
        submitting: true,
      },
    })
    await submitting.find('.tx-chat-composer__attach').trigger('click')
    expect(submitting.emitted('attachmentClick')).toBeUndefined()

    const allowed = mount(TxChatComposer, {
      props: {
        showAttachmentButton: true,
        submitting: true,
        allowAttachmentWhileSubmitting: true,
      },
    })
    await allowed.find('.tx-chat-composer__attach').trigger('click')
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

  it('guards keyCode 229 and isComposing Enter presses during IME composition', async () => {
    const wrapper = mount(TxChatComposer, {
      props: {
        modelValue: 'nihao',
        sendOnMetaEnter: false,
      },
    })

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', isComposing: true })
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', keyCode: 229 })
    expect(wrapper.emitted('send')).toBeUndefined()

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')).toEqual([[{ text: 'nihao' }]])
  })

  it('supports capsule stop island, sendQueues, dictation, removable AiAttachments, and refraction glow', async () => {
    const streaming = mount(TxChatComposer, {
      props: {
        modelValue: '',
        streaming: true,
        dictatable: true,
        stopButtonText: 'Stop run',
        surface: 'refraction',
        conversing: true,
        beamActive: true,
        attachments: [
          { id: 'doc1', kind: 'file', name: 'notes.md', uploading: true },
        ],
        attachmentRemovable: true,
      },
    })

    expect(streaming.classes()).toContain('is-surface-refraction')
    expect(streaming.classes()).toContain('is-conversing')
    expect(streaming.classes()).toContain('is-beam')
    expect(streaming.classes()).toContain('is-streaming')
    expect(streaming.find('.tx-chat-composer__attachment').classes()).toContain('is-pending')
    expect(streaming.find('.tx-chat-composer__mic-slot').classes()).toContain('is-yielding')

    const stopBtn = streaming.find('.tx-chat-composer__send')
    expect(stopBtn.classes()).toContain('is-stop')
    expect(stopBtn.attributes('disabled')).toBeUndefined()
    await stopBtn.trigger('click')
    expect(streaming.emitted('stop')).toHaveLength(1)

    await streaming.find('.tx-chat-composer__attachment-remove').trigger('click')
    expect(streaming.emitted('attachmentRemove')).toEqual([['doc1']])

    // With sendQueues + draft text during streaming, primary action queues/sends instead of stopping
    await streaming.setProps({ modelValue: 'Follow-up', sendQueues: true })
    expect(stopBtn.classes()).toContain('is-queue')
    await stopBtn.trigger('click')
    expect(streaming.emitted('send')).toEqual([[{ text: 'Follow-up' }]])

    // Dictation active + Esc cancels dictation and marks textarea readonly
    await streaming.setProps({ streaming: false, listening: true, micState: 'listening', micElapsedMs: 65000 })
    expect(streaming.find('textarea').attributes('readonly')).toBeDefined()
    expect(streaming.find('.tx-chat-composer__dictate-timer').text()).toBe('01:05')
    await streaming.find('textarea').trigger('keydown', { key: 'Escape' })
    expect(streaming.emitted('dictateCancel')).toHaveLength(1)
    expect(streaming.emitted('update:listening')?.at(-1)).toEqual([false])

    const vm = streaming.vm as unknown as {
      box: HTMLElement | null
      input: HTMLTextAreaElement | null
      ghost: HTMLElement | null
      focus: () => void
      blur: () => void
      launch: () => Promise<void>
    }
    expect(vm.box).toBeTruthy()
    expect(vm.input).toBeTruthy()
    expect(vm.ghost).toBeTruthy()
    await expect(vm.launch()).resolves.toBeUndefined()
  })

  it('lets explicit sendState="ready" and sendState="empty" override draft inference', async () => {
    const readyEmpty = mount(TxChatComposer, {
      props: { modelValue: '', sendOnMetaEnter: false, sendState: 'ready' },
    })
    const readyBtn = readyEmpty.find('.tx-chat-composer__send')
    expect(readyEmpty.classes()).toContain('is-send-ready')
    expect(readyBtn.attributes('disabled')).toBeUndefined()
    await readyBtn.trigger('click')
    await readyEmpty.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(readyEmpty.emitted('send')).toEqual([[{ text: '' }], [{ text: '' }]])

    await readyEmpty.setProps({ submitting: true })
    expect(readyBtn.attributes('disabled')).toBeDefined()

    const forcedEmpty = mount(TxChatComposer, {
      props: { modelValue: 'has draft', sendOnMetaEnter: false, sendState: 'empty' },
    })
    const emptyBtn = forcedEmpty.find('.tx-chat-composer__send')
    expect(forcedEmpty.classes()).toContain('is-send-empty')
    expect(emptyBtn.attributes('disabled')).toBeDefined()
    await emptyBtn.trigger('click')
    await forcedEmpty.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(forcedEmpty.emitted('send')).toBeUndefined()
  })

  it('cancels dictation on Escape from focused child controls without letting Enter outside textarea submit', async () => {
    const wrapper = mount(TxChatComposer, {
      props: {
        modelValue: 'Draft text',
        sendOnMetaEnter: false,
        dictatable: true,
        listening: true,
        micState: 'listening',
      },
    })

    const micBtn = wrapper.find('.tx-chat-composer__mic')
    await micBtn.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')).toBeUndefined()

    await micBtn.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('dictateCancel')).toHaveLength(1)
    expect(wrapper.emitted('update:listening')).toEqual([[false]])
  })

  it('disables attachment removal when the composer itself is disabled', async () => {
    const wrapper = mount(TxChatComposer, {
      props: {
        disabled: true,
        attachmentRemovable: true,
        attachments: [{ id: 'att-1', label: 'report.pdf' }],
      },
    })

    const removeBtn = wrapper.find('.tx-chat-composer__attachment-remove')
    expect(removeBtn.attributes('disabled')).toBeDefined()
    await removeBtn.trigger('click')
    expect(wrapper.emitted('attachmentRemove')).toBeUndefined()
  })
})
