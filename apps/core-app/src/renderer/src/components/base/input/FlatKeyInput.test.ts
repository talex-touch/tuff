// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FlatKeyInput from './FlatKeyInput.vue'

/**
 * The platform the recorder runs on. Handed out as a computed ref, the way the real
 * `useRendererPlatform` does: the bug this guards was reading that ref as a bare value, and a mock
 * returning a plain boolean would hide it.
 */
const platform = vi.hoisted(() => ({ current: 'darwin' }))

vi.mock('~/modules/platform/renderer-platform', async () => {
  const { computed } = await import('vue')
  return {
    useRendererPlatform: () => ({
      platform: computed(() => platform.current),
      isMac: computed(() => platform.current === 'darwin')
    })
  }
})

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

/**
 * `attach` is opt-in: a detached tree never takes focus in jsdom, so anything asserting on
 * `document.activeElement` has to be attached to the document to mean anything.
 */
function mountKeyInput(modelValue = '', clearable = false, attach = false) {
  return mount(FlatKeyInput, {
    props: { modelValue, clearable },
    ...(attach ? { attachTo: document.body } : {})
  })
}

/** Dispatched by hand so the harness can inspect whether the field swallowed the key. */
function pressKey(element: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init
  })
  element.dispatchEvent(event)
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

  it('records Backspace as a binding when the host cannot drop one', async () => {
    const wrapper = mountKeyInput('Control+K')
    const input = wrapper.get<HTMLInputElement>('input')

    pressKey(input.element, { key: 'Backspace' })
    await wrapper.vm.$nextTick()

    // The clear affordance is opt-in: without it Backspace is an ordinary recorder key, and the
    // settings rows that treat an empty accelerator as a no-op would otherwise swallow it.
    expect(wrapper.emitted('update:modelValue')).toEqual([['Backspace']])
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

  it('drops the binding on Escape and hands the cancel key back to the host', async () => {
    const wrapper = mountKeyInput('Control+K', true, true)
    const field = wrapper.get<HTMLElement>('[tabindex="0"]')
    field.element.focus()

    const event = pressKey(field.element, { key: 'Escape' })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    // Consuming Escape is fine while it clears, but the capture has to end with it so the drawer
    // or dialog hosting the field still gets its cancel key.
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).not.toBe(field.element)
  })

  it('drops the binding on Backspace and keeps the field captured for its replacement', async () => {
    const wrapper = mountKeyInput('Control+K', true, true)
    const field = wrapper.get<HTMLElement>('[tabindex="0"]')
    field.element.focus()

    const event = pressKey(field.element, { key: 'Backspace' })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    expect(event.defaultPrevented).toBe(true)
    // Backspace reads as "delete this one", and the next key is usually the replacement, so
    // unlike Escape it must not release the field.
    expect(document.activeElement).toBe(field.element)
  })

  it.each(['Escape', 'Backspace'])(
    'stays silent on %s when there is no binding to drop',
    async (key) => {
      const wrapper = mountKeyInput('', true)

      pressKey(wrapper.get<HTMLInputElement>('input').element, { key })
      await wrapper.vm.$nextTick()

      // Empty already means "no binding": announcing it again would make a host that unbinds on
      // empty drop a shortcut the user never cleared.
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    }
  )
})

/**
 * The recorder writes the accelerator Electron and the main process read, so the Windows key has
 * to come out as `Super` off macOS. It came out as `Command` everywhere: the platform check read a
 * computed ref as a boolean, which is always true.
 */
describe('FlatKeyInput modifier names', () => {
  afterEach(() => {
    platform.current = 'darwin'
  })

  it.each([
    ['win32', { key: 'e', metaKey: true }, 'Super+E'],
    ['linux', { key: 'e', metaKey: true }, 'Super+E'],
    ['darwin', { key: 'e', metaKey: true }, 'Command+E'],
    ['win32', { key: 'k', altKey: true }, 'Alt+K'],
    ['darwin', { key: 'k', altKey: true }, 'Option+K'],
    ['win32', { key: ' ', metaKey: true, shiftKey: true }, 'Super+Shift+Space']
  ])('on %s records %o as %s', async (os, init, expected) => {
    platform.current = os
    const wrapper = mountKeyInput()

    pressKey(wrapper.get<HTMLInputElement>('input').element, init)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[expected]])
  })
})
