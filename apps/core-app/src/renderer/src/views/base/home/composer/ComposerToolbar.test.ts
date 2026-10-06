// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- the menus and the hint badge are test doubles */
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPOSER_MOTION } from './composer-motion'
import ComposerToolbar from './ComposerToolbar.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

vi.mock('~/components/shell/MetaHintBadge.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ setup: () => () => h('span') }) }
})

// The two menus own their own suites; here they only have to render their trigger in place.
vi.mock('../HomeModelMenu.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('div', { class: 'model-menu-stub' }, slots.trigger?.({ open: false }))
    })
  }
})

vi.mock('../HomePermissionMenu.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { mode: String },
      emits: ['update:mode', 'reset'],
      setup:
        (props, { emit }) =>
        () =>
          h('button', {
            class: 'permission-stub',
            'data-mode': props.mode,
            onClick: () => emit('update:mode', 'full'),
            onContextmenu: () => emit('reset')
          })
    })
  }
})

interface AnimateCall {
  target: Element
  keyframes: Record<string, unknown>[]
}

let calls: AnimateCall[] = []
let now = 0

beforeEach(() => {
  calls = []
  now = 0
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  Element.prototype.animate = function (this: Element, keyframes) {
    calls.push({ target: this, keyframes: keyframes as Record<string, unknown>[] })
    return { cancel: vi.fn(), onfinish: null } as unknown as Animation
  }
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // @ts-expect-error jsdom ships no WAAPI; the stub is removed again.
  delete Element.prototype.animate
})

async function advance(ms: number): Promise<void> {
  now += ms
  vi.advanceTimersByTime(ms)
  await nextTick()
}

function mountToolbar(props: Record<string, unknown> = {}): VueWrapper {
  return mount(ComposerToolbar, {
    props: {
      permissionMode: 'review',
      model: { label: 'Claude Opus', effort: '高' },
      sendState: 'ready',
      micState: 'idle',
      ...props
    },
    attachTo: document.body
  })
}

describe('ComposerToolbar', () => {
  it('keeps every slot fixed through a send and its reply: only the absolute keys change width', async () => {
    const wrapper = mountToolbar()
    const slots = wrapper.findAll('.ComposerToolbar-MicSlot, .ComposerToolbar-SendSlot')
    expect(slots).toHaveLength(2)
    const slotStyles = slots.map((slot) => slot.attributes('style'))

    // T3: launch, the draft clears, the turn starts; T4; T5.
    ;(wrapper.vm as unknown as { launch: () => void }).launch()
    await wrapper.setProps({ sendState: 'empty' })
    await wrapper.setProps({ sendState: 'waiting' })
    await advance(600)
    await wrapper.setProps({ sendState: 'streaming' })
    await wrapper.setProps({ sendState: 'empty' })
    await advance(600)

    const resized = calls.filter((call) => 'width' in (call.keyframes[0] ?? {}))
    expect(resized.length).toBeGreaterThan(0)
    for (const call of resized) {
      expect((call.target as HTMLElement).classList.contains('ComposerSendIsland')).toBe(true)
    }
    // Nothing in the row itself is animated or restyled.
    const rowElements = [
      wrapper.element,
      ...wrapper.findAll('.ComposerToolbar-Left, .ComposerToolbar-Right').map((w) => w.element),
      ...slots.map((slot) => slot.element),
      wrapper.get('.ComposerToolbar-ModelSlot').element
    ]
    expect(calls.filter((call) => rowElements.includes(call.target))).toEqual([])
    expect(slots.map((slot) => slot.attributes('style'))).toEqual(slotStyles)
    wrapper.unmount()
  })

  it('yields the microphone to the stop capsule and takes it back', async () => {
    const wrapper = mountToolbar()
    const mic = (): HTMLElement => wrapper.get('button.ComposerMic').element as HTMLElement
    await wrapper.setProps({ sendState: 'waiting' })
    expect(mic().hasAttribute('inert')).toBe(true)
    await wrapper.setProps({ sendState: 'ready' })
    expect(mic().hasAttribute('inert')).toBe(true)
    await advance(COMPOSER_MOTION.micYield.backDelayMs)
    expect(mic().hasAttribute('inert')).toBe(false)
    wrapper.unmount()
  })

  it('starts yielded when it mounts during a reply', () => {
    const wrapper = mountToolbar({ sendState: 'streaming' })
    expect(wrapper.get('button.ComposerMic').attributes('inert')).toBeDefined()
    wrapper.unmount()
  })

  it('keeps only what a dictation session needs: the left cluster and the model step out', async () => {
    const wrapper = mountToolbar()
    const left = wrapper.get('.ComposerToolbar-Left').element as HTMLElement
    const modelSlot = wrapper.get('.ComposerToolbar-ModelSlot').element as HTMLElement
    expect(left.hasAttribute('inert')).toBe(false)
    expect(modelSlot.hasAttribute('inert')).toBe(false)

    await wrapper.setProps({ micState: 'listening', micElapsedMs: 7400 })

    // Hidden, inert and out of the accessibility tree: no pointer, no Tab stop, nothing read.
    expect(wrapper.classes()).toContain('is-dictating')
    for (const element of [left, modelSlot]) {
      expect(element.hasAttribute('inert')).toBe(true)
      expect(element.getAttribute('aria-hidden')).toBe('true')
    }
    expect(modelSlot.classList.contains('is-yielded')).toBe(true)
    // The microphone and the send key stay: one stops the session, the other finishes and sends.
    expect(wrapper.get('.ComposerToolbar-MicSlot').attributes('inert')).toBeUndefined()
    expect(wrapper.get('button.ComposerMic').classes()).toContain('is-live')

    await wrapper.setProps({ micState: 'idle' })
    expect(left.hasAttribute('inert')).toBe(false)
    expect(modelSlot.hasAttribute('inert')).toBe(false)
    expect(wrapper.classes()).not.toContain('is-dictating')
    wrapper.unmount()
  })

  it("shows the session's state where the left cluster was, and reads it once per state", async () => {
    const wrapper = mountToolbar({ micState: 'starting' })
    const status = (): string => wrapper.get('.ComposerToolbar-Status').text()
    const live = (): string => wrapper.get('.ComposerToolbar-LiveStatus').text()
    expect(wrapper.get('.ComposerToolbar-Status').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.ComposerToolbar-LiveStatus').attributes('role')).toBe('status')

    expect(wrapper.find('.ComposerToolbar-Spinner').exists()).toBe(true)
    expect(status()).toContain('assistant.voicePanel.voicePreparing')
    expect(live()).toBe('assistant.voicePanel.voicePreparing')

    await wrapper.setProps({ micState: 'listening', micElapsedMs: 67_000 })
    expect(wrapper.find('.ComposerToolbar-RecDot').exists()).toBe(true)
    expect(status()).toContain('home.composer.dictationListening')
    expect(wrapper.get('.ComposerToolbar-Timer').text()).toBe('1:07')
    expect(wrapper.get('.ComposerToolbar-EscHint').text()).toBe('· home.composer.dictationEscHint')
    // The timer ticks for the eye only.
    expect(live()).toBe('home.composer.dictationListening')

    await wrapper.setProps({ micState: 'finishing' })
    expect(status()).toContain('home.composer.dictationFinishing')
    expect(live()).toBe('home.composer.dictationFinishing')

    await wrapper.setProps({ micState: 'idle', micOutcome: 'inserted' })
    expect(status()).toBe('')
    expect(live()).toBe('home.composer.dictationInserted')
    wrapper.unmount()
  })

  it('withholds the microphone entry, and only it, on a build that cannot capture', async () => {
    const wrapper = mountToolbar({ micBlocked: true })
    // Withheld, not disabled: the press that could only fail is not in the row at all, and the
    // send key stays where it was.
    expect(wrapper.find('button.ComposerMic').exists()).toBe(false)
    expect(wrapper.find('button.ComposerSendIsland').exists()).toBe(true)

    await wrapper.setProps({ micBlocked: false })
    expect(wrapper.find('button.ComposerMic').exists()).toBe(true)
    wrapper.unmount()
  })

  it('names the send key 「结束并发送」 while dictating', async () => {
    const wrapper = mountToolbar({ micState: 'listening' })
    expect(wrapper.get('button.ComposerSendIsland').attributes('aria-label')).toBe(
      'home.composer.finishAndSend'
    )
    await wrapper.setProps({ micState: 'idle' })
    expect(wrapper.get('button.ComposerSendIsland').attributes('aria-label')).toBe('home.send')
    wrapper.unmount()
  })

  it('passes the model pill its label and effort, and relays every action', async () => {
    const wrapper = mountToolbar()
    const pill = wrapper.get('.ComposerModelPill')
    expect(pill.text()).toContain('Claude Opus')
    expect(pill.text()).toContain('高')

    await wrapper.get('button.ComposerSendIsland').trigger('click')
    expect(wrapper.emitted('send')).toHaveLength(1)
    await wrapper.get('button.ComposerMic').trigger('click')
    expect(wrapper.emitted('mic')).toHaveLength(1)
    await wrapper.get('.permission-stub').trigger('click')
    expect(wrapper.emitted('update:permissionMode')).toEqual([['full']])
    await wrapper.get('.permission-stub').trigger('contextmenu')
    expect(wrapper.emitted('reset-approvals')).toHaveLength(1)

    const input = wrapper.get('input[type="file"]').element as HTMLInputElement
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await wrapper.get('input[type="file"]').trigger('change')
    expect(wrapper.emitted('files')).toEqual([[[file]]])

    await wrapper.setProps({ sendState: 'streaming' })
    await wrapper.get('button.ComposerSendIsland').trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
    wrapper.unmount()
  })
})
