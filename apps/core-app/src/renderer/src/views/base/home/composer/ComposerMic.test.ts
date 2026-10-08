// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ComposerMic from './ComposerMic.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

interface AnimateCall {
  target: Element
  keyframes: Record<string, unknown>[]
}

let calls: AnimateCall[] = []
let reduced = false

beforeEach(() => {
  calls = []
  reduced = false
  Element.prototype.animate = function (this: Element, keyframes) {
    calls.push({ target: this, keyframes: keyframes as Record<string, unknown>[] })
    return { cancel: vi.fn(), onfinish: null } as unknown as Animation
  }
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  // @ts-expect-error jsdom ships no WAAPI; the stub is removed again.
  delete Element.prototype.animate
})

describe('ComposerMic', () => {
  it('is the microphone at rest and the stop key while a session runs', async () => {
    const wrapper = mount(ComposerMic, { props: { state: 'idle' } })
    expect(wrapper.attributes('aria-label')).toBe('home.voice')
    expect(wrapper.attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('.ComposerMic-Glyph').classes()).toContain('i-ri-mic-line')
    await wrapper.trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)

    for (const state of ['starting', 'listening'] as const) {
      await wrapper.setProps({ state })
      expect(wrapper.attributes('aria-label')).toBe('home.composer.dictationStop')
      expect(wrapper.attributes('aria-pressed')).toBe('true')
      expect(wrapper.classes()).toContain('is-live')
      expect(wrapper.find('.ComposerMic-Stop').exists()).toBe(true)
      expect(wrapper.find('.ComposerMic-Glyph').exists()).toBe(false)
    }
    await wrapper.trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(2)
  })

  it('holds a spinner and takes no press while the last words are recognized', async () => {
    const wrapper = mount(ComposerMic, { props: { state: 'finishing' } })
    expect(wrapper.find('.ComposerMic-Spinner').exists()).toBe(true)
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.attributes('aria-disabled')).toBe('true')

    await wrapper.trigger('click')
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('never grows: the key keeps its 32px slot in every state', async () => {
    const wrapper = mount(ComposerMic, { props: { state: 'idle' } })
    for (const state of ['starting', 'listening', 'finishing', 'idle'] as const) {
      await wrapper.setProps({ state })
      expect(wrapper.attributes('style')).toBeUndefined()
    }
    expect(calls.filter((call) => 'width' in (call.keyframes[0] ?? {}))).toEqual([])
  })

  it('leaves the slot to the stop capsule while yielded: hidden, inert, silent', async () => {
    const wrapper = mount(ComposerMic, { props: { state: 'idle' } })
    await wrapper.setProps({ yielded: true })
    await nextTick()

    expect(wrapper.classes()).toContain('is-yielded')
    expect(wrapper.attributes('inert')).toBeDefined()
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(calls.some((call) => call.keyframes.at(-1)?.opacity === 0)).toBe(true)
    await wrapper.trigger('click')
    expect(wrapper.emitted('toggle')).toBeUndefined()

    await wrapper.setProps({ yielded: false })
    expect(wrapper.attributes('inert')).toBeUndefined()
    expect(calls.some((call) => call.keyframes.at(-1)?.opacity === 1)).toBe(true)
  })

  it('yields and returns at once under reduced motion', async () => {
    reduced = true
    const wrapper = mount(ComposerMic, { props: { state: 'idle' } })
    await wrapper.setProps({ yielded: true })
    await wrapper.setProps({ yielded: false })
    expect(calls).toEqual([])
  })
})
