import type { FileUploaderFile } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxFileUploader from '../src/TxFileUploader.vue'

describe('txFileUploader', () => {
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
