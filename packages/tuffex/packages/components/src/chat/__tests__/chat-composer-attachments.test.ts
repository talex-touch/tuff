import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxChatComposer from '../src/TxChatComposer.vue'

function makeFile(name: string): File {
  return new File(['x'], name, { type: 'image/png' })
}

function pasteEventWith(files: File[], text = ''): ClipboardEvent {
  const items = files.map(file => ({
    kind: 'file' as const,
    getAsFile: () => file,
  }))
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items,
      getData: () => text,
      files,
    },
  })
  return event
}

function dragEventWith(files: File[], type: string): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: files.length > 0 ? ['Files'] : [],
      files,
    },
  })
  return event
}

describe('txChatComposer attachment intake', () => {
  it('extracts pasted files into attachmentAdd and keeps the raw paste event', async () => {
    const wrapper = mount(TxChatComposer)
    const textarea = wrapper.find('textarea').element
    const file = makeFile('shot.png')
    const event = pasteEventWith([file])

    textarea.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('paste')).toHaveLength(1)
    expect(wrapper.emitted('attachmentAdd')).toEqual([[[file]]])
    // File-carrying pastes are consumed so platform side text never lands.
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves plain text pastes alone', async () => {
    const wrapper = mount(TxChatComposer)
    const event = pasteEventWith([], 'just words')

    wrapper.find('textarea').element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('paste')).toHaveLength(1)
    expect(wrapper.emitted('attachmentAdd')).toBeUndefined()
    expect(event.defaultPrevented).toBe(false)
  })

  it('ignores pasted files while submitting', async () => {
    const wrapper = mount(TxChatComposer, { props: { submitting: true } })
    const event = pasteEventWith([makeFile('late.png')])

    wrapper.find('textarea').element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('attachmentAdd')).toBeUndefined()
  })

  it('highlights on file drag and emits dropped files', async () => {
    const wrapper = mount(TxChatComposer)
    const root = wrapper.element
    const file = makeFile('dropped.png')

    root.dispatchEvent(dragEventWith([file], 'dragenter'))
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('is-dragover')

    root.dispatchEvent(dragEventWith([file], 'drop'))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('attachmentAdd')).toEqual([[[file]]])
    expect(wrapper.classes()).not.toContain('is-dragover')
  })

  it('keeps the highlight while crossing children and clears it on the final leave', async () => {
    const wrapper = mount(TxChatComposer)
    const root = wrapper.element
    const file = makeFile('crossing.png')

    root.dispatchEvent(dragEventWith([file], 'dragenter')) // enter root
    root.dispatchEvent(dragEventWith([file], 'dragenter')) // enter child
    root.dispatchEvent(dragEventWith([file], 'dragleave')) // leave root-into-child
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('is-dragover')

    root.dispatchEvent(dragEventWith([file], 'dragleave')) // leave for real
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('is-dragover')
  })

  it('does not highlight for non-file drags', async () => {
    const wrapper = mount(TxChatComposer)
    wrapper.element.dispatchEvent(dragEventWith([], 'dragenter'))
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('is-dragover')
  })

  it('never sends while an IME composition is confirming', async () => {
    const wrapper = mount(TxChatComposer, {
      props: { modelValue: '你好', sendOnMetaEnter: false },
    })

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', isComposing: true })
    expect(wrapper.emitted('send')).toBeUndefined()

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', isComposing: false })
    expect(wrapper.emitted('send')).toEqual([[{ text: '你好' }]])
  })
})
