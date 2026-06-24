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
})
