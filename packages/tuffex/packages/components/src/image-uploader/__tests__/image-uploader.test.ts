import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TxImageUploader from '../src/TxImageUploader.vue'

function createFile(name: string, type = 'image/png') {
  return new File(['image'], name, { type })
}

function setFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', {
    value: files,
    configurable: true,
  })
}

function setInputValue(input: HTMLInputElement, value: string) {
  Object.defineProperty(input, 'value', {
    value,
    writable: true,
    configurable: true,
  })
}

describe('txImageUploader', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders input attributes and existing previews', () => {
    const wrapper = mount(TxImageUploader, {
      props: {
        modelValue: [{ id: 'a', url: '/a.png', name: 'A' }],
        multiple: false,
        accept: 'image/png',
      },
    })

    const input = wrapper.find<HTMLInputElement>('input[type="file"]')
    expect(input.attributes('multiple')).toBeUndefined()
    expect(input.attributes('accept')).toBe('image/png')
    expect(wrapper.find('img').attributes('src')).toBe('/a.png')
    expect(wrapper.find('img').attributes('alt')).toBe('A')
    expect(wrapper.find('.tx-image-uploader__remove').attributes('aria-label')).toBe('Remove A')
  })

  it('adds selected files up to max and resets input value', async () => {
    const wrapper = mount(TxImageUploader, {
      props: {
        modelValue: [{ id: 'existing', url: '/existing.png', name: 'Existing' }],
        max: 2,
      },
    })

    const input = wrapper.find<HTMLInputElement>('input[type="file"]').element
    setInputValue(input, 'fake-path')
    setFiles(input, [createFile('one.png'), createFile('two.png')])
    await wrapper.find('input[type="file"]').trigger('change')

    const update = wrapper.emitted('update:modelValue')?.[0]?.[0]
    expect(update).toHaveLength(2)
    expect(update?.[1]).toMatchObject({
      url: 'blob:one.png',
      name: 'one.png',
      file: expect.any(File),
    })
    expect(input.value).toBe('')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('does not add files when max is reached or disabled', async () => {
    const maxed = mount(TxImageUploader, {
      props: {
        modelValue: [{ id: 'existing', url: '/existing.png' }],
        max: 1,
      },
    })
    const maxedInput = maxed.find<HTMLInputElement>('input[type="file"]').element
    setFiles(maxedInput, [createFile('one.png')])
    await maxed.find('input[type="file"]').trigger('change')
    expect(maxed.emitted('update:modelValue')).toBeUndefined()

    const disabled = mount(TxImageUploader, {
      props: {
        modelValue: [],
        disabled: true,
      },
    })
    await disabled.find('.tx-image-uploader__add').trigger('click')
    expect(disabled.emitted('update:modelValue')).toBeUndefined()
  })

  it('removes files, revokes owned object urls, and emits remove/change', async () => {
    const wrapper = mount(TxImageUploader, {
      props: {
        modelValue: [],
      },
    })
    const input = wrapper.find<HTMLInputElement>('input[type="file"]').element
    setFiles(input, [createFile('one.png')])
    await wrapper.find('input[type="file"]').trigger('change')

    const added = wrapper.emitted('update:modelValue')?.[0]?.[0] ?? []
    await wrapper.setProps({ modelValue: added })
    await wrapper.find('.tx-image-uploader__remove').trigger('click')

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:one.png')
    expect(wrapper.emitted('remove')?.[0]?.[0]).toMatchObject({ id: added[0].id, value: [] })
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual([])
  })

  it('blocks remove while disabled', async () => {
    const wrapper = mount(TxImageUploader, {
      props: {
        modelValue: [{ id: 'a', url: '/a.png', name: 'A' }],
        disabled: true,
      },
    })

    const remove = wrapper.find<HTMLButtonElement>('.tx-image-uploader__remove')
    expect(remove.attributes('disabled')).toBeDefined()
    await remove.trigger('click')
    expect(wrapper.emitted('remove')).toBeUndefined()
  })

  it('revokes created object urls on unmount', async () => {
    const wrapper = mount(TxImageUploader, {
      props: {
        modelValue: [],
      },
    })
    const input = wrapper.find<HTMLInputElement>('input[type="file"]').element
    setFiles(input, [createFile('one.png'), createFile('two.png')])
    await wrapper.find('input[type="file"]').trigger('change')

    wrapper.unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:one.png')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:two.png')
  })
})
