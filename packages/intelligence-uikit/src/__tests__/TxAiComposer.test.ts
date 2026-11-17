import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAiComposer from '../components/conversation/TxAiComposer.vue'

describe('txAiComposer', () => {
  it('renders English default copy and blocks empty send until text is entered', async () => {
    const wrapper = mount(TxAiComposer)
    const textarea = wrapper.get('textarea')
    const sendBtn = wrapper.get('.tx-ai-send-island')

    expect(textarea.attributes('placeholder')).toBe('Write a message…')
    expect((sendBtn.element as HTMLButtonElement).disabled).toBe(true)

    await textarea.setValue('Inspect component parity')
    expect((sendBtn.element as HTMLButtonElement).disabled).toBe(false)

    await sendBtn.trigger('click')
    expect(wrapper.emitted('send')?.[0]).toEqual([{ text: 'Inspect component parity' }])
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
  })

  it('guards Enter during IME composition and switches to stop/queue capsules when busy', async () => {
    const wrapper = mount(TxAiComposer, {
      props: {
        submitting: true,
        queuedCount: 1,
        modelValue: '',
      },
    })

    const stopBtn = wrapper.get('.tx-ai-send-island')
    expect(stopBtn.classes()).toContain('is-stop')
    await stopBtn.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)

    await wrapper.setProps({ modelValue: 'Follow up question' })
    const queueBtn = wrapper.get('.tx-ai-send-island')
    expect(queueBtn.classes()).toContain('is-queue')
    expect(queueBtn.text()).toContain('(1)')

    const textarea = wrapper.get('textarea')
    await textarea.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(wrapper.emitted('queue')).toBeUndefined()

    await textarea.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('queue')?.[0]).toEqual([{ text: 'Follow up question' }])
  })

  it('opens @ source and / command token menus with keyboard insertion', async () => {
    const wrapper = mount(TxAiComposer, {
      props: {
        sources: [
          { key: 'attach', name: 'Add photos', attach: true },
          { key: 'docs', name: 'docs', desc: 'Engineering specs', connectable: true, connected: true },
        ],
        commands: [
          { key: 'review', name: '/review', desc: 'Audit UI diff' },
        ],
      },
    })

    const textarea = wrapper.get('textarea')
    await textarea.setValue('@do')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1)

    await textarea.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('sourceSelect')?.[0]?.[0]).toMatchObject({ key: 'docs' })
    expect((textarea.element as HTMLTextAreaElement).value).toBe('@docs ')

    await textarea.setValue('/rev')
    await textarea.trigger('keydown', { key: 'Tab' })
    expect(wrapper.emitted('commandSelect')?.[0]?.[0]).toMatchObject({ key: 'review' })
    expect((textarea.element as HTMLTextAreaElement).value).toBe('/review ')
  })

  it('supports model selection, dictation draft bar, run status, context meter, and attachments', async () => {
    const wrapper = mount(TxAiComposer, {
      props: {
        models: [
          { key: 'gpt-5.4', name: 'GPT-5.4', tag: 'Flagship' },
          { key: 'local', name: 'Local', tag: 'Fast' },
        ],
        model: 'gpt-5.4',
        dictatable: true,
        listening: true,
        dictationState: 'listening',
        dictationElapsedMs: 1800,
        attachments: [
          { kind: 'file', id: 'a1', name: 'patch.diff', size: 1024 },
        ],
        runStatus: { streaming: true, elapsedMs: 1200 },
        contextMeter: { usedTokens: 64_000, maxTokens: 128_000 },
      },
      global: {
        stubs: {
          TxVoiceBeam: true,
        },
      },
    })

    expect(wrapper.get('textarea').attributes('readonly')).toBeDefined()
    expect(wrapper.find('.tx-ai-voice-draft').text()).toContain('1.8s')
    expect(wrapper.find('.tx-ai-run-status').exists()).toBe(true)
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('50')

    await wrapper.get('textarea').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('dictateCancel')).toHaveLength(1)

    const modelBtn = wrapper.find('.tx-ai-composer__model-picker button')
    await modelBtn.trigger('click')
    const options = wrapper.findAll('.tx-ai-composer__model-option')
    await options[1].trigger('click')
    expect(wrapper.emitted('update:model')?.[0]).toEqual(['local'])

    await wrapper.setProps({ listening: false, dictationState: 'idle' })
    await wrapper.get('.tx-ai-composer-mic').trigger('click')
    expect(wrapper.emitted('mic')).toHaveLength(1)

    const file = new File(['hello'], 'context.txt', { type: 'text/plain' })
    await wrapper.find('.tx-ai-composer').trigger('drop', {
      dataTransfer: { files: [file], types: ['Files'] },
    })
    expect(wrapper.emitted('attachmentAdd')?.[0]?.[0]).toHaveLength(1)
  })
})
