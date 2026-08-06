import type { FileUploaderFile } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxFileUploader from '../src/TxFileUploader.vue'

describe('txFileUploader', () => {
  it('uses a native button as the drop zone browse control', async () => {
    const wrapper = mount(TxFileUploader, {
      props: { modelValue: [] },
    })
    const dropZone = wrapper.find('.tx-file-uploader__drop')
    const browseButton = wrapper.find('.tx-file-uploader__button')

    expect(dropZone.attributes('role')).toBeUndefined()
    expect(dropZone.attributes('tabindex')).toBeUndefined()
    expect(dropZone.element.tagName).toBe('BUTTON')
    expect(dropZone.attributes('type')).toBe('button')
    expect(browseButton.element.tagName).toBe('SPAN')
  })

  it('blocks browse activation when disabled', async () => {
    const wrapper = mount(TxFileUploader, {
      props: { modelValue: [], disabled: true },
    })
    const inputClick = vi.spyOn(wrapper.find('input[type="file"]').element, 'click')

    await wrapper.find('.tx-file-uploader__drop').trigger('click')

    expect(wrapper.classes()).toContain('is-disabled')
    expect(wrapper.find('.tx-file-uploader__drop').attributes('disabled')).toBeDefined()
    expect(inputClick).not.toHaveBeenCalled()
  })

  it('emits added files on change', async () => {
    const wrapper = mount(TxFileUploader, {
      props: { modelValue: [] },
    })

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [file],
    })
    await input.trigger('change')

    const emitted = wrapper.emitted('update:modelValue') as Array<[FileUploaderFile[]]> | undefined
    expect(emitted).toBeTruthy()
    expect(emitted?.[0][0][0].name).toBe('hello.txt')
  })

  it('respects the multiple flag when files are dropped', async () => {
    function dropTwoFiles(el: Element) {
      const fileA = new File(['a'], 'a.txt', { type: 'text/plain' })
      const fileB = new File(['b'], 'b.txt', { type: 'text/plain' })
      const event = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: { files: [fileA, fileB] } })
      el.dispatchEvent(event)
    }

    const many = mount(TxFileUploader, { props: { modelValue: [], multiple: true } })
    dropTwoFiles(many.find('.tx-file-uploader').element)
    await many.vm.$nextTick()
    const manyEmitted = many.emitted('update:modelValue') as Array<[FileUploaderFile[]]> | undefined
    expect(manyEmitted?.[0]?.[0]).toHaveLength(2)

    // A single-file uploader must drop only the first file, mirroring the native picker.
    const single = mount(TxFileUploader, { props: { modelValue: [], multiple: false } })
    dropTwoFiles(single.find('.tx-file-uploader').element)
    await single.vm.$nextTick()
    const singleEmitted = single.emitted('update:modelValue') as Array<[FileUploaderFile[]]> | undefined
    expect(singleEmitted?.[0]?.[0]).toHaveLength(1)
    expect(singleEmitted?.[0]?.[0]?.[0]?.name).toBe('a.txt')
  })

  it('keeps the drag highlight while the cursor crosses an inner element boundary', async () => {
    const wrapper = mount(TxFileUploader, { props: { modelValue: [] } })
    const rootEl = wrapper.find('.tx-file-uploader').element

    function fireDrag(type: string, relatedTarget: EventTarget | null = null) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'relatedTarget', { value: relatedTarget })
      rootEl.dispatchEvent(event)
    }

    fireDrag('dragover')
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('is-dragging')

    // dragleave bubbling onto an inner child (still inside the root) must NOT flicker off.
    fireDrag('dragleave', wrapper.find('.tx-file-uploader__drop').element)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('is-dragging')

    // Leaving the drop zone entirely (relatedTarget outside the root) clears it.
    fireDrag('dragleave', document.body)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('is-dragging')
  })

  it('removes files', async () => {
    const wrapper = mount(TxFileUploader, {
      props: { modelValue: [] },
    })

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [file],
    })
    await input.trigger('change')
    const added
      = (wrapper.emitted('update:modelValue') as Array<[FileUploaderFile[]]> | undefined)?.[0]?.[0]
        ?? []
    await wrapper.setProps({ modelValue: added })

    await wrapper.find('.tx-file-uploader__remove').trigger('click')
    expect(wrapper.emitted('remove')).toBeTruthy()
  })

  it('enforces accept on the drop path, not just the picker', async () => {
    const wrapper = mount(TxFileUploader, {
      props: { modelValue: [], accept: 'image/png' },
    })

    const png = new File(['p'], 'shot.png', { type: 'image/png' })
    const video = new File(['v'], 'clip.mp4', { type: 'video/mp4' })
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files: [video, png] } })
    wrapper.find('.tx-file-uploader').element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    // The browser applies `accept` to the picker only; the drop path used to add
    // anything, so a declared-unacceptable type reached modelValue.
    const emitted = wrapper.emitted('update:modelValue') as Array<[FileUploaderFile[]]> | undefined
    expect(emitted?.[0]?.[0]).toHaveLength(1)
    expect(emitted?.[0]?.[0]?.[0]?.name).toBe('shot.png')
  })

  it('matches accept by extension and wildcard group', async () => {
    const wrapper = mount(TxFileUploader, {
      props: { modelValue: [], accept: '.pdf,image/*' },
    })

    const pdf = new File(['d'], 'doc.pdf', { type: 'application/pdf' })
    const jpg = new File(['j'], 'pic.jpg', { type: 'image/jpeg' })
    const txt = new File(['t'], 'notes.txt', { type: 'text/plain' })
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files: [pdf, jpg, txt] } })
    wrapper.find('.tx-file-uploader').element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    const emitted = wrapper.emitted('update:modelValue') as Array<[FileUploaderFile[]]> | undefined
    expect(emitted?.[0]?.[0]?.map(f => f.name)).toEqual(['doc.pdf', 'pic.jpg'])
  })

  it('replaces the file instead of accumulating when multiple is false', async () => {
    const wrapper = mount(TxFileUploader, {
      props: { modelValue: [], multiple: false },
    })

    async function pick(name: string) {
      const input = wrapper.find('input[type="file"]')
      Object.defineProperty(input.element, 'files', {
        value: [new File(['x'], name, { type: 'text/plain' })],
        configurable: true,
      })
      await input.trigger('change')
      const emitted = wrapper.emitted('update:modelValue') as Array<[FileUploaderFile[]]> | undefined
      const next = emitted?.at(-1)?.[0] ?? []
      await wrapper.setProps({ modelValue: next })
      return next
    }

    await pick('a.pdf')
    const second = await pick('b.pdf')

    // A single-file uploader owns one slot; it used to grow toward `max`.
    expect(second).toHaveLength(1)
    expect(second[0]?.name).toBe('b.pdf')
  })
})
