import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxSearchInput from '../src/TxSearchInput.vue'

function mountSearchInput(props: Record<string, unknown> = {}) {
  const wrapper = mount(TxSearchInput, {
    props: {
      modelValue: '',
      ...props,
      'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }),
    },
  })
  return wrapper
}

describe('txSearchInput', () => {
  it('emits value updates and searches on Enter', async () => {
    const wrapper = mountSearchInput()
    const input = wrapper.find('input')

    await input.setValue('agent query')
    await input.trigger('keydown.enter')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['agent query'])
    expect(wrapper.emitted('input')?.[0]).toEqual(['agent query'])
    expect(wrapper.emitted('search')?.[0]).toEqual(['agent query'])
  })

  it('debounces remote search while typing', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(TxSearchInput, {
        props: {
          modelValue: '',
          remote: true,
          searchDebounce: 120,
          'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }),
        },
      })
      const input = wrapper.find('input')

      await input.setValue('remote query')
      vi.advanceTimersByTime(119)
      expect(wrapper.emitted('search')).toBeFalsy()

      vi.advanceTimersByTime(1)
      expect(wrapper.emitted('search')?.[0]).toEqual(['remote query'])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('does not emit remote search when disabled', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(TxSearchInput, {
        props: {
          disabled: true,
          remote: true,
          searchDebounce: 0,
        },
      })

      await wrapper.setProps({ modelValue: 'blocked query' })
      vi.advanceTimersByTime(0)

      expect(wrapper.emitted('search')).toBeFalsy()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('forwards clear and exposed input methods', async () => {
    const wrapper = mountSearchInput({
        modelValue: 'initial',
        clearable: true,
    })

    expect(wrapper.vm.getValue()).toBe('initial')

    wrapper.vm.setValue('next')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['next'])

    await wrapper.find('.tx-input__clear').trigger('click')
    expect(wrapper.emitted('clear')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })
})
