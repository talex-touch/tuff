// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import FlatKeyInput from './FlatKeyInput.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('~/modules/channel/main/shortcon', () => ({
  shortconApi: {
    disableAll: vi.fn(),
    enableAll: vi.fn()
  }
}))

function mountKeyInput(modelValue = '', clearable = false) {
  return mount(FlatKeyInput, {
    props: { modelValue, clearable }
  })
}

/** Dispatched by hand so the harness can inspect whether the field swallowed the key. */
function pressKey(input: HTMLInputElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init
  })
  input.dispatchEvent(event)
  return event
}

describe('FlatKeyInput capture', () => {
  it('treats Escape as cancel: no binding, and the key stays available to the host', async () => {
    const wrapper = mountKeyInput('Control+K')
    const input = wrapper.get<HTMLInputElement>('input')
    input.element.focus()

    const event = pressKey(input.element, { key: 'Escape' })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    // Swallowing Escape would leave the surrounding drawer or dialog unable to close on it.
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).not.toBe(input.element)
  })

  it('records a real combination and consumes the key', async () => {
    const wrapper = mountKeyInput()
    const input = wrapper.get<HTMLInputElement>('input')

    const event = pressKey(input.element, { key: 'k', ctrlKey: true })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([['Control+K']])
    expect(event.defaultPrevented).toBe(true)
  })

  it('keeps modifier-only presses from overwriting a binding', async () => {
    const wrapper = mountKeyInput('Control+K')
    const input = wrapper.get<HTMLInputElement>('input')

    pressKey(input.element, { key: 'Shift', shiftKey: true })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('FlatKeyInput clear affordance', () => {
  it('is absent unless the host can drop the binding', () => {
    const wrapper = mountKeyInput('Control+K')

    expect(wrapper.find('button.FlatKeyInput-Clear').exists()).toBe(false)
  })

  it('reports an empty accelerator so the host can unbind', async () => {
    const wrapper = mountKeyInput('Control+K', true)

    await wrapper.get('button.FlatKeyInput-Clear').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
  })

  it('offers nothing to clear when no binding is set', () => {
    const wrapper = mountKeyInput('', true)

    expect(wrapper.get('button.FlatKeyInput-Clear').attributes('disabled')).toBeDefined()
  })
})
