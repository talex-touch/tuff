import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
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

  it('syncs token menu highlight with engaged state, ignores mousedown selection, and dismisses model menu cleanly', async () => {
    const wrapper = mount(TxAiComposer, {
      attachTo: document.body,
      props: {
        sources: [
          { key: 'alpha', name: 'alpha', desc: 'First source' },
          { key: 'beta', name: 'beta', desc: 'Second source' },
        ],
        models: [
          { key: 'gpt-5.4', name: 'GPT-5.4' },
          { key: 'local', name: 'Local' },
        ],
        model: 'gpt-5.4',
      },
    })

    const textarea = wrapper.get('textarea')
    await textarea.setValue('@')
    const listbox = wrapper.get('.tx-ai-token-menu[role="listbox"]')
    const listboxId = listbox.attributes('id')
    expect(listboxId).toBeTruthy()
    expect(textarea.attributes('aria-controls')).toBe(listboxId)
    expect(textarea.attributes('aria-activedescendant')).toBeUndefined()

    const options = wrapper.findAll('.tx-ai-token-menu__option')
    expect(options).toHaveLength(2)
    expect(options[0].attributes('id')).toBeTruthy()
    expect(options.some(opt => opt.classes().includes('is-active'))).toBe(false)
    expect(options.some(opt => opt.attributes('aria-selected') === 'true')).toBe(false)

    await textarea.trigger('keydown', { key: 'ArrowDown' })
    expect(options[0].classes()).toContain('is-active')
    expect(options[0].attributes('aria-selected')).toBe('true')
    expect(textarea.attributes('aria-activedescendant')).toBe(options[0].attributes('id'))

    await textarea.trigger('keydown', { key: 'ArrowDown' })
    expect(options[1].classes()).toContain('is-active')
    expect(textarea.attributes('aria-activedescendant')).toBe(options[1].attributes('id'))

    await options[0].trigger('mousedown')
    expect(wrapper.emitted('sourceSelect')).toBeUndefined()
    await options[0].trigger('click')
    expect(wrapper.emitted('sourceSelect')).toHaveLength(1)
    expect(textarea.attributes('aria-controls')).toBeUndefined()
    expect(textarea.attributes('aria-activedescendant')).toBeUndefined()

    const modelTrigger = wrapper.get('.tx-ai-composer__model-picker .tx-ai-composer-control')
    expect(modelTrigger.attributes('aria-haspopup')).toBe('listbox')
    expect(modelTrigger.attributes('aria-expanded')).toBe('false')

    await modelTrigger.trigger('click')
    expect(modelTrigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.tx-ai-composer__model-menu').exists()).toBe(true)

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(modelTrigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.tx-ai-composer__model-menu').exists()).toBe(false)

    await modelTrigger.trigger('click')
    const modelOptions = wrapper.findAll('.tx-ai-composer__model-option')
    ;(modelOptions[1].element as HTMLButtonElement).focus()
    await modelOptions[1].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:model')?.[0]).toEqual(['local'])
    expect(wrapper.find('.tx-ai-composer__model-menu').exists()).toBe(false)
    expect(document.activeElement).toBe(modelTrigger.element)

    await modelTrigger.trigger('click')
    expect(wrapper.find('.tx-ai-composer__model-menu').exists()).toBe(true)
    await wrapper.get('.tx-ai-composer__model-menu').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.tx-ai-composer__model-menu').exists()).toBe(false)
    expect(document.activeElement).toBe(modelTrigger.element)

    wrapper.unmount()
  })

  it('gives explicit maxHeight precedence over maxRows while respecting minHeight', async () => {
    const wrapper = mount(TxAiComposer, {
      props: {
        maxHeight: 80,
        maxRows: 6,
      },
    })

    const textarea = wrapper.get('textarea')
    Object.defineProperty(textarea.element, 'scrollHeight', {
      configurable: true,
      get: () => 120,
    })

    await textarea.setValue('Line 1\nLine 2\nLine 3\nLine 4\nLine 5')
    await wrapper.vm.$nextTick()
    expect((textarea.element as HTMLTextAreaElement).style.height).toBe('80px')
    expect((textarea.element as HTMLTextAreaElement).style.overflowY).toBe('auto')

    await wrapper.setProps({ maxHeight: undefined, maxRows: 3 })
    await textarea.trigger('input')
    await wrapper.vm.$nextTick()
    expect((textarea.element as HTMLTextAreaElement).style.height).toBe('72px')

    await wrapper.setProps({ minHeight: 96, maxHeight: 80 })
    await textarea.trigger('input')
    await wrapper.vm.$nextTick()
    expect((textarea.element as HTMLTextAreaElement).style.height).toBe('96px')
  })

  it('guards toolbar submit callback on resolved sendState and enforces attachment permissions across paste and drag/drop', async () => {
    const wrapper = mount(TxAiComposer, {
      props: {
        modelValue: 'Ready draft',
        sendState: 'disabled',
        submitting: true,
        allowAttachmentWhileSubmitting: false,
      },
      slots: {
        toolbar: ({ submit }: { submit: () => void }) =>
          h('button', { type: 'button', class: 'custom-submit', onClick: () => submit() }, 'Custom send'),
      },
    })

    await wrapper.get('.custom-submit').trigger('click')
    expect(wrapper.emitted('send')).toBeUndefined()
    expect(wrapper.emitted('queue')).toBeUndefined()

    await wrapper.setProps({ sendState: 'stop' })
    await wrapper.get('.custom-submit').trigger('click')
    expect(wrapper.emitted('send')).toBeUndefined()
    expect(wrapper.emitted('queue')).toBeUndefined()

    const file = new File(['hello'], 'locked.txt', { type: 'text/plain' })
    const root = wrapper.get('.tx-ai-composer')

    await root.trigger('dragenter', { dataTransfer: { types: ['Files'] } })
    expect(root.classes()).not.toContain('is-dragging')

    const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(dragOverEvent, 'dataTransfer', { value: { types: ['Files'] } })
    root.element.dispatchEvent(dragOverEvent)
    expect(dragOverEvent.defaultPrevented).toBe(false)

    await root.trigger('drop', { dataTransfer: { files: [file], types: ['Files'] } })
    expect(wrapper.emitted('attachmentAdd')).toBeUndefined()

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { files: [file], getData: () => 'ordinary text' },
    })
    wrapper.get('textarea').element.dispatchEvent(pasteEvent)
    expect(pasteEvent.defaultPrevented).toBe(false)
    expect(wrapper.emitted('paste')).toHaveLength(1)
    expect(wrapper.emitted('attachmentAdd')).toBeUndefined()

    await wrapper.setProps({ sendState: 'queue', allowAttachmentWhileSubmitting: true })
    wrapper.get('textarea').element.dispatchEvent(pasteEvent)
    expect(wrapper.emitted('attachmentAdd')).toHaveLength(1)

    await wrapper.get('.custom-submit').trigger('click')
    expect(wrapper.emitted('queue')?.[0]).toEqual([{ text: 'Ready draft' }])
  })

  it('scopes unique token listbox IDs across instances and keeps run status button role separate from sibling live region', async () => {
    const pair = mount({
      components: { TxAiComposer },
      template: `
        <div>
          <TxAiComposer :sources="sources" model-value="@" :run-status="runStatus" />
          <TxAiComposer :sources="sources" model-value="@" />
        </div>
      `,
      data() {
        return {
          sources: [{ key: 'docs', name: 'docs' }],
          runStatus: {
            step: { key: 'tool', label: 'Running check', detail: 'eslint', status: 'running' as const },
            steps: [
              { key: 's1', label: 'Lint', status: 'done' as const },
              { key: 's2', label: 'Test', status: 'running' as const },
            ],
            elapsedMs: 2400,
          },
        }
      },
    })

    await pair.vm.$nextTick()
    const listboxes = pair.findAll('.tx-ai-token-menu[role="listbox"]')
    expect(listboxes).toHaveLength(2)
    expect(listboxes[0].attributes('id')).not.toBe(listboxes[1].attributes('id'))

    const statusBtn = pair.get('button.tx-ai-run-status')
    expect(statusBtn.attributes('role')).toBeUndefined()
    expect(statusBtn.attributes('aria-live')).toBeUndefined()
    expect(statusBtn.text()).toContain('1/2')
    expect(statusBtn.text()).toContain('2.4s')

    const liveRegion = pair.get('.tx-ai-run-status__sr')
    expect(liveRegion.attributes('role')).toBe('status')
    expect(liveRegion.attributes('aria-live')).toBe('polite')
    expect(liveRegion.text()).toBe('Running check: eslint')
    expect(liveRegion.text()).not.toContain('1/2')
    expect(liveRegion.text()).not.toContain('2.4s')
  })
})
