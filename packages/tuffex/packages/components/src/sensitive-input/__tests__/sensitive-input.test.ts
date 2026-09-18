import type { VueWrapper } from '@vue/test-utils'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TxSensitiveInput from '../src/TxSensitiveInput.vue'

// The copy tab holds a pending reset timer; leaving one mounted lets it fire
// into the next test's component.
enableAutoUnmount(afterEach)

function mountInput(props: Record<string, unknown> = {}) {
  return mount(TxSensitiveInput, {
    props: { modelValue: 'sk_live_abc123', label: 'API Key', ...props },
    attachTo: document.body,
  })
}

function field(wrapper: VueWrapper<any>) {
  return wrapper.find('.tx-sensitive-input__field')
}

function input(wrapper: VueWrapper<any>) {
  return wrapper.find('input')
}

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return writeText
}

describe('txSensitiveInput', () => {
  it('starts masked and keeps the value out of the rendered text', () => {
    const wrapper = mountInput()

    expect(input(wrapper).attributes('type')).toBe('password')
    expect(wrapper.find('.tx-sensitive-input__mask-dots').text()).toBe('••••••••')
    expect(wrapper.text()).not.toContain('sk_live_abc123')
  })

  it('turns the masked field into a button that owns focus, and hides the input from AT', () => {
    const wrapper = mountInput()

    expect(field(wrapper).attributes('role')).toBe('button')
    expect(field(wrapper).attributes('tabindex')).toBe('0')
    expect(field(wrapper).attributes('aria-label')).toBe('API Key, masked.')
    // Both instruction and live region: an announced button with no stated
    // action tells the user nothing.
    expect(field(wrapper).attributes('aria-describedby')?.split(' ')).toHaveLength(2)
    expect(input(wrapper).attributes('aria-hidden')).toBe('true')
    expect(input(wrapper).attributes('tabindex')).toBe('-1')
  })

  it('reveals on click and on Enter, and moves focus into the input', async () => {
    const wrapper = mountInput()

    await field(wrapper).trigger('click')

    expect(input(wrapper).attributes('type')).toBe('text')
    expect(wrapper.emitted('reveal')).toHaveLength(1)
    expect(field(wrapper).attributes('role')).toBeUndefined()
    expect(document.activeElement).toBe(input(wrapper).element)

    await input(wrapper).trigger('blur')
    expect(input(wrapper).attributes('type')).toBe('password')

    await field(wrapper).trigger('keydown', { key: 'Enter' })
    expect(input(wrapper).attributes('type')).toBe('text')
  })

  it('keeps a read-only secret revealable without focusing an uneditable input', async () => {
    const wrapper = mountInput({ readonly: true })

    await field(wrapper).trigger('click')

    expect(input(wrapper).attributes('type')).toBe('text')
    expect(input(wrapper).attributes('readonly')).toBeDefined()
    expect(document.activeElement).not.toBe(input(wrapper).element)
  })

  it('re-masks on blur and on Escape, returning focus to the container', async () => {
    const wrapper = mountInput()
    await field(wrapper).trigger('click')

    await input(wrapper).trigger('keydown', { key: 'Escape' })

    expect(input(wrapper).attributes('type')).toBe('password')
    expect(wrapper.emitted('mask')).toHaveLength(1)
    // The input drops to tabindex="-1" when masked; leaving focus there would
    // strand the keyboard user on an untabbable element.
    expect(document.activeElement).toBe(field(wrapper).element)
  })

  it('does not re-mask when focus moves to the eye or copy button', async () => {
    const wrapper = mountInput()
    await field(wrapper).trigger('click')

    const eye = wrapper.find('.tx-sensitive-input__eye')
    await input(wrapper).trigger('blur', { relatedTarget: eye.element })

    expect(input(wrapper).attributes('type')).toBe('text')
    expect(wrapper.emitted('mask')).toBeUndefined()
  })

  it('does not reveal when disabled', async () => {
    const wrapper = mountInput({ disabled: true })

    await field(wrapper).trigger('click')
    await field(wrapper).trigger('keydown', { key: 'Enter' })

    expect(input(wrapper).attributes('type')).toBe('password')
    expect(wrapper.emitted('reveal')).toBeUndefined()
    expect(field(wrapper).attributes('aria-disabled')).toBe('true')
    // No copy affordance on a disabled field: it would still hand out the secret.
    expect(wrapper.find('.tx-sensitive-input__copy').exists()).toBe(false)
  })

  it('is an ordinary editable input while empty, and shows typed characters', async () => {
    const wrapper = mountInput({ modelValue: '' })

    expect(field(wrapper).attributes('role')).toBeUndefined()
    expect(wrapper.find('.tx-sensitive-input__mask').exists()).toBe(false)
    expect(wrapper.find('.tx-sensitive-input__copy').exists()).toBe(false)

    await input(wrapper).setValue('a')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['a'])

    await wrapper.setProps({ modelValue: 'a' })
    expect(input(wrapper).attributes('type')).toBe('text')
  })

  it('masks a value that arrives from outside after mount', async () => {
    const wrapper = mountInput({ modelValue: '' })

    await wrapper.setProps({ modelValue: 'sk_fetched' })

    expect(input(wrapper).attributes('type')).toBe('password')
    expect(field(wrapper).attributes('role')).toBe('button')
  })

  it('drops back to the empty state when the value is cleared', async () => {
    const wrapper = mountInput()

    await wrapper.setProps({ modelValue: '' })

    expect(field(wrapper).attributes('role')).toBeUndefined()
    expect(wrapper.find('.tx-sensitive-input__mask').exists()).toBe(false)
  })

  it('copies the value, announces it, and reverts after the confirm window', async () => {
    vi.useFakeTimers()
    const writeText = stubClipboard()
    const wrapper = mountInput({ copiedDuration: 1000 })

    await wrapper.find('.tx-sensitive-input__copy').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(writeText).toHaveBeenCalledWith('sk_live_abc123')
    expect(wrapper.emitted('copy')?.[0]).toEqual(['sk_live_abc123'])
    expect(wrapper.find('.tx-sensitive-input__copy').text()).toBe('Copied')
    expect(wrapper.find('[role="status"]').text()).toBe('Copied to clipboard')
    // Copying must not unmask: that is the whole point of the tab.
    expect(input(wrapper).attributes('type')).toBe('password')

    vi.advanceTimersByTime(1000)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-sensitive-input__copy').text()).toBe('Copy')
    vi.useRealTimers()
  })

  it('reports a denied clipboard instead of failing silently', async () => {
    const error = new Error('denied')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(error) },
    })
    const wrapper = mountInput()

    await wrapper.find('.tx-sensitive-input__copy').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('copyError')?.[0]).toEqual([error])
    expect(wrapper.emitted('copy')).toBeUndefined()
    expect(wrapper.find('.tx-sensitive-input__copy').text()).toBe('Copy')
  })

  it('derives the error state from the message so the two cannot disagree', async () => {
    const wrapper = mountInput({ error: 'This API key is not valid' })

    expect(wrapper.classes()).toContain('is-error')
    expect(wrapper.find('[role="alert"]').text()).toBe('This API key is not valid')
    expect(input(wrapper).attributes('aria-invalid')).toBe('true')

    // An error message replaces the description rather than stacking under it.
    await wrapper.setProps({ description: 'Keep this value secure' })
    expect(wrapper.find('.tx-sensitive-input__description').exists()).toBe(false)

    await wrapper.setProps({ error: '' })
    expect(wrapper.classes()).not.toContain('is-error')
    expect(wrapper.find('.tx-sensitive-input__description').text()).toBe('Keep this value secure')
  })

  it('localizes every rendered string through labels', async () => {
    const wrapper = mountInput({
      labels: {
        reveal: '点击查看',
        copy: '复制',
        show: '显示',
        masked: '已遮蔽',
        hidden: '值已隐藏',
        instruction: '点击或按回车查看。',
      },
    })

    expect(wrapper.find('.tx-sensitive-input__mask-reveal').text()).toBe('点击查看')
    expect(wrapper.find('.tx-sensitive-input__copy').text()).toBe('复制')
    expect(wrapper.find('.tx-sensitive-input__eye').attributes('aria-label')).toBe('显示')
    expect(field(wrapper).attributes('aria-label')).toBe('API Key, 已遮蔽')
    expect(wrapper.find('[role="status"]').text()).toBe('值已隐藏')
  })

  it('names the masked field without a label prop', () => {
    const wrapper = mountInput({ label: '' })

    expect(field(wrapper).attributes('aria-label')).toBe('Sensitive value, masked.')
    expect(wrapper.find('.tx-sensitive-input__label').exists()).toBe(false)
  })

  it('toggles visibility from the eye button without touching the container handler', async () => {
    const wrapper = mountInput()
    await field(wrapper).trigger('click')

    const eye = wrapper.find('.tx-sensitive-input__eye')
    expect(eye.attributes('aria-label')).toBe('Hide value')

    await eye.trigger('click')
    expect(input(wrapper).attributes('type')).toBe('password')
    expect(eye.attributes('aria-label')).toBe('Reveal value')

    await eye.trigger('click')
    expect(input(wrapper).attributes('type')).toBe('text')
  })

  it('exposes imperative reveal, mask and copy', async () => {
    const writeText = stubClipboard()
    const wrapper = mountInput()

    wrapper.vm.reveal()
    await wrapper.vm.$nextTick()
    expect(input(wrapper).attributes('type')).toBe('text')

    wrapper.vm.mask()
    await wrapper.vm.$nextTick()
    expect(input(wrapper).attributes('type')).toBe('password')

    await wrapper.vm.copy()
    expect(writeText).toHaveBeenCalledWith('sk_live_abc123')
  })
})
