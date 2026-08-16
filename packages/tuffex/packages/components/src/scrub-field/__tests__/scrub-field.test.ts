import type { VueWrapper } from '@vue/test-utils'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TxScrubField from '../src/TxScrubField.vue'

// A field left mounted mid-drag keeps a capture-phase window keydown listener
// alive and swallows the next test's Escape.
enableAutoUnmount(afterEach)

function mountField(props: Record<string, unknown> = {}) {
  return mount(TxScrubField, {
    props: { modelValue: 100, label: 'W', min: 0, max: 200, ...props },
    attachTo: document.body,
  })
}

function lastValue(wrapper: VueWrapper<any>): number | undefined {
  const emitted = wrapper.emitted('update:modelValue') as Array<[number]> | undefined
  return emitted?.at(-1)?.[0]
}

describe('txScrubField', () => {
  it('renders the handle, the value and an optional suffix', () => {
    const wrapper = mountField({ suffix: '%' })

    expect(wrapper.find('.tx-bui-scrub-field__handle').text()).toBe('W')
    expect((wrapper.find('.tx-bui-scrub-field__input').element as HTMLInputElement).value).toBe('100')
    expect(wrapper.find('.tx-bui-scrub-field__suffix').text()).toBe('%')
  })

  it('describes the handle as a slider and names the input separately', () => {
    const wrapper = mountField({ suffix: '%' })
    const handle = wrapper.find('.tx-bui-scrub-field__handle')

    expect(handle.attributes('role')).toBe('slider')
    expect(handle.attributes('aria-label')).toBe('W')
    expect(handle.attributes('aria-valuenow')).toBe('100')
    expect(handle.attributes('aria-valuemin')).toBe('0')
    expect(handle.attributes('aria-valuemax')).toBe('200')
    expect(handle.attributes('aria-valuetext')).toBe('100%')
    expect(handle.attributes('aria-orientation')).toBe('horizontal')
    expect(handle.attributes('tabindex')).toBe('0')
    expect(wrapper.find('.tx-bui-scrub-field__input').attributes('aria-label')).toBe('W value')
  })

  it('advances one step per two pixels of travel', async () => {
    const wrapper = mountField()
    const handle = wrapper.find('.tx-bui-scrub-field__handle')

    await handle.trigger('pointerdown', { clientX: 100, pointerId: 1 })
    expect(wrapper.emitted('scrubStart')).toHaveLength(1)

    await handle.trigger('pointermove', { clientX: 110, pointerId: 1 })
    expect(lastValue(wrapper)).toBe(105)

    await handle.trigger('pointermove', { clientX: 80, pointerId: 1 })
    expect(lastValue(wrapper)).toBe(90)

    await handle.trigger('pointerup', { pointerId: 1 })
    expect(wrapper.emitted('scrubEnd')).toHaveLength(1)
  })

  it('measures travel from where the drag started, not the live value', async () => {
    const wrapper = mountField()
    const handle = wrapper.find('.tx-bui-scrub-field__handle')

    await handle.trigger('pointerdown', { clientX: 0, pointerId: 1 })
    await handle.trigger('pointermove', { clientX: 20, pointerId: 1 })
    await wrapper.setProps({ modelValue: 110 })
    await handle.trigger('pointermove', { clientX: 40, pointerId: 1 })

    expect(lastValue(wrapper)).toBe(120)
  })

  it('scales travel by the step and keeps the step precision', async () => {
    const wrapper = mountField({ modelValue: 1, min: 0, max: 10, step: 0.5 })
    const handle = wrapper.find('.tx-bui-scrub-field__handle')

    await handle.trigger('pointerdown', { clientX: 0, pointerId: 1 })
    await handle.trigger('pointermove', { clientX: 6, pointerId: 1 })

    expect(lastValue(wrapper)).toBe(2.5)
  })

  it('abandons the gesture on Escape, back to the pre-drag value', async () => {
    const wrapper = mountField()
    const handle = wrapper.find('.tx-bui-scrub-field__handle')

    await handle.trigger('pointerdown', { clientX: 100, pointerId: 1 })
    await handle.trigger('pointermove', { clientX: 140, pointerId: 1 })
    await wrapper.setProps({ modelValue: 120 })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(lastValue(wrapper)).toBe(100)
    expect(wrapper.emitted('scrubEnd')).toHaveLength(1)

    // The gesture is over: further movement is ignored.
    await handle.trigger('pointermove', { clientX: 200, pointerId: 1 })
    expect(lastValue(wrapper)).toBe(100)
  })

  it('ends the drag on pointer cancel and lost capture', async () => {
    for (const event of ['pointercancel', 'lostpointercapture']) {
      const wrapper = mountField()
      const handle = wrapper.find('.tx-bui-scrub-field__handle')

      await handle.trigger('pointerdown', { clientX: 0, pointerId: 1 })
      await handle.trigger(event, { pointerId: 1 })
      await handle.trigger('pointermove', { clientX: 100, pointerId: 1 })

      expect(wrapper.emitted('scrubEnd')).toHaveLength(1)
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    }
  })

  it('steps with the arrow keys and multiplies them with Shift', async () => {
    const wrapper = mountField()
    const handle = wrapper.find('.tx-bui-scrub-field__handle')

    await handle.trigger('keydown', { key: 'ArrowUp' })
    expect(lastValue(wrapper)).toBe(101)

    await handle.trigger('keydown', { key: 'ArrowLeft' })
    expect(lastValue(wrapper)).toBe(99)

    await handle.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(lastValue(wrapper)).toBe(110)

    await handle.trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    expect(lastValue(wrapper)).toBe(90)
  })

  it('jumps to the bounds with Home and End', async () => {
    const wrapper = mountField()
    const handle = wrapper.find('.tx-bui-scrub-field__handle')

    await handle.trigger('keydown', { key: 'Home' })
    expect(lastValue(wrapper)).toBe(0)

    await handle.trigger('keydown', { key: 'End' })
    expect(lastValue(wrapper)).toBe(200)
  })

  it('clamps to the range from every input path', async () => {
    const wrapper = mountField({ modelValue: 199 })
    const handle = wrapper.find('.tx-bui-scrub-field__handle')

    await handle.trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expect(lastValue(wrapper)).toBe(200)

    await wrapper.find('.tx-bui-scrub-field__input').setValue('9999')
    expect(lastValue(wrapper)).toBe(200)

    await wrapper.find('.tx-bui-scrub-field__input').setValue('-40')
    expect(lastValue(wrapper)).toBe(0)
  })

  it('commits typed digits and ignores partial input', async () => {
    const wrapper = mountField()
    const input = wrapper.find('.tx-bui-scrub-field__input')

    await input.setValue('42')
    expect(lastValue(wrapper)).toBe(42)

    await input.setValue('')
    expect(lastValue(wrapper)).toBe(42)

    await input.setValue('-')
    expect(lastValue(wrapper)).toBe(42)
  })

  it('holds the typed text until blur in clampOn="blur" mode', async () => {
    const wrapper = mountField({ clampOn: 'blur' })
    const input = wrapper.find('.tx-bui-scrub-field__input')

    await input.trigger('focus')
    await input.setValue('5')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect((input.element as HTMLInputElement).value).toBe('5')

    await input.setValue('50')
    await input.trigger('blur')
    expect(lastValue(wrapper)).toBe(50)
  })

  it('reverts the typed text on Escape', async () => {
    const wrapper = mountField({ clampOn: 'blur' })
    const input = wrapper.find('.tx-bui-scrub-field__input')

    await input.trigger('focus')
    await input.setValue('7')
    await input.trigger('keydown', { key: 'Escape' })

    expect((input.element as HTMLInputElement).value).toBe('100')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('follows the host value while it is not being typed into', async () => {
    const wrapper = mountField()
    await wrapper.setProps({ modelValue: 64 })
    expect((wrapper.find('.tx-bui-scrub-field__input').element as HTMLInputElement).value).toBe('64')
  })

  it('emits nothing when the value would not change', async () => {
    const wrapper = mountField({ modelValue: 0, min: 0, max: 10 })
    await wrapper.find('.tx-bui-scrub-field__handle').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('goes inert when disabled', async () => {
    const wrapper = mountField({ disabled: true })
    const handle = wrapper.find('.tx-bui-scrub-field__handle')

    await handle.trigger('pointerdown', { clientX: 0, pointerId: 1 })
    await handle.trigger('pointermove', { clientX: 100, pointerId: 1 })
    await handle.trigger('keydown', { key: 'ArrowUp' })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('scrubStart')).toBeUndefined()
    expect(handle.attributes('tabindex')).toBe('-1')
    expect(handle.attributes('aria-disabled')).toBe('true')
    expect(wrapper.classes()).toContain('is-disabled')
  })

  it('marks the changed state for the host', () => {
    expect(mountField({ active: true }).classes()).toContain('is-active')
    expect(mountField().classes()).not.toContain('is-active')
  })

  it('exposes focus for both of its controls', () => {
    const wrapper = mountField()
    const vm = wrapper.vm as unknown as { focus: () => void, focusInput: () => void }

    vm.focus()
    expect(document.activeElement).toBe(wrapper.find('.tx-bui-scrub-field__handle').element)

    vm.focusInput()
    expect(document.activeElement).toBe(wrapper.find('.tx-bui-scrub-field__input').element)
  })
})
