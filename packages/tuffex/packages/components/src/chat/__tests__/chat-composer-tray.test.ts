import type { PropType } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import TxChatComposer from '../src/TxChatComposer.vue'

enableAutoUnmount(afterEach)

const CARD_HEIGHT = 120
const TRAY_ROW = 44

/** The fitted timing from the reference clip; see the constants in TxChatComposer.vue. */
const SLIDE_TIMING = {
  duration: 450,
  delay: 70,
  easing: 'cubic-bezier(0.65, 0.16, 0.1, 0.88)',
  fill: 'backwards',
}

const Host = defineComponent({
  props: {
    placement: { type: String as PropType<'top' | 'bottom'>, default: 'bottom' },
    showTray: { type: Boolean, default: true },
    trayLabel: { type: String, default: undefined },
  },
  setup(props) {
    return () => h(
      TxChatComposer,
      { trayPlacement: props.placement, trayLabel: props.trayLabel },
      props.showTray
        ? {
            tray: () => h(
              'button',
              { type: 'button', class: 'tray-action' },
              props.placement === 'top' ? 'Select a project' : 'Connect apps',
            ),
          }
        : {},
    )
  },
})

function mountHost(props: { placement?: 'top' | 'bottom', showTray?: boolean, trayLabel?: string } = {}) {
  return mount(Host, {
    props,
    attachTo: document.body,
    // The real Transition (VTU stubs it), so the leaving tray actually lingers.
    global: { stubs: { transition: false } },
  })
}

function trays(root: Element): HTMLElement[] {
  return Array.from(root.children).filter(
    (el): el is HTMLElement => el.classList.contains('tx-chat-composer__tray'),
  )
}

function inFlowTrays(root: Element): HTMLElement[] {
  return trays(root).filter(el => !el.classList.contains('tx-chat-composer-tray-leave-active'))
}

function rect(top: number, height: number): DOMRect {
  return { x: 0, y: top, top, left: 0, width: 480, height, right: 480, bottom: top + height, toJSON: () => ({}) } as DOMRect
}

/**
 * jsdom lays nothing out. This answers the two reads the choreography makes —
 * the card's offset inside the shell and the shell's height — from the DOM the
 * way a browser would: a leaving tray is absolute, so it holds no space.
 */
function installLayoutStub(): void {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      if (this.classList.contains('tx-chat-composer'))
        return rect(0, CARD_HEIGHT + inFlowTrays(this).length * TRAY_ROW)
      if (this.classList.contains('tx-chat-composer__card')) {
        const above = inFlowTrays(this.parentElement!).some(el => el.classList.contains('is-top'))
        return rect(above ? TRAY_ROW : 0, CARD_HEIGHT)
      }
      return rect(0, 0)
    },
  })
}

interface FakeAnimation {
  onfinish: (() => void) | null
  oncancel: (() => void) | null
  cancelled: boolean
  cancel: () => void
  finish: () => void
}

interface AnimateCall {
  element: HTMLElement
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  animation: FakeAnimation
}

/** jsdom ships no Web Animations API; the stub records what the component asked for. */
function installWaapiStub(): AnimateCall[] {
  const calls: AnimateCall[] = []
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const animation: FakeAnimation = {
        onfinish: null,
        oncancel: null,
        cancelled: false,
        cancel() {
          this.cancelled = true
          this.oncancel?.()
        },
        finish() {
          this.onfinish?.()
        },
      }
      calls.push({ element: this, keyframes, options, animation })
      return animation
    },
  })
  return calls
}

function stubReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

/** Vue's leave waits two frames before checking for a transition to wait on. */
async function afterLeave(): Promise<void> {
  for (let frame = 0; frame < 3; frame += 1)
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
  await nextTick()
}

const originalMatchMedia = window.matchMedia

beforeEach(() => {
  installLayoutStub()
  stubReducedMotion(false)
})

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect')
  Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  window.matchMedia = originalMatchMedia
})

describe('txChatComposer tray', () => {
  it('renders the tray below the card by default and marks the shell', () => {
    const wrapper = mountHost()
    const root = wrapper.find('.tx-chat-composer')

    const tray = wrapper.find('.tx-chat-composer__tray')
    expect(tray.classes()).toContain('is-bottom')
    expect(tray.element.previousElementSibling?.classList.contains('tx-chat-composer__card')).toBe(true)
    expect(tray.text()).toBe('Connect apps')
    expect(root.classes()).toEqual(expect.arrayContaining(['has-tray', 'is-tray-bottom']))
  })

  it('renders the tray above the card when trayPlacement is top', () => {
    const wrapper = mountHost({ placement: 'top' })

    const tray = wrapper.find('.tx-chat-composer__tray')
    expect(tray.classes()).toContain('is-top')
    expect(tray.element.nextElementSibling?.classList.contains('tx-chat-composer__card')).toBe(true)
    expect(wrapper.find('.tx-chat-composer').classes()).toContain('is-tray-top')
  })

  it('renders no tray and no tray classes without the slot', () => {
    const wrapper = mountHost({ showTray: false })
    const root = wrapper.find('.tx-chat-composer')

    expect(wrapper.find('.tx-chat-composer__tray').exists()).toBe(false)
    expect(root.classes()).not.toContain('has-tray')
    expect(root.classes()).not.toContain('is-tray-bottom')
    // The card is there either way: the root never switches between card and shell.
    expect(wrapper.find('.tx-chat-composer__card textarea').exists()).toBe(true)
  })

  it('makes the tray a labelled group only when trayLabel is set', () => {
    const plain = mountHost()
    expect(plain.find('.tx-chat-composer__tray').attributes('role')).toBeUndefined()
    expect(plain.find('.tx-chat-composer__tray').attributes('aria-label')).toBeUndefined()

    const labelled = mountHost({ trayLabel: 'Connected apps' })
    expect(labelled.find('.tx-chat-composer__tray').attributes('role')).toBe('group')
    expect(labelled.find('.tx-chat-composer__tray').attributes('aria-label')).toBe('Connected apps')
  })

  it('declares the tray props at runtime, where the dev servers can see them', () => {
    // A type-only declaration resolved from types.ts once and never picked up a
    // new field in the Vite/Nuxt dev servers (TxFilterChips, TxTabBar).
    const runtimeProps = (TxChatComposer as unknown as { props: Record<string, { default?: unknown }> }).props
    expect(runtimeProps.trayPlacement?.default).toBe('bottom')
    expect(runtimeProps).toHaveProperty('trayLabel')
  })

  it('keeps the same textarea, and its focus, when a tray arrives', async () => {
    const wrapper = mountHost({ showTray: false })
    const textarea = wrapper.find('textarea').element
    textarea.focus()

    await wrapper.setProps({ showTray: true })

    expect(wrapper.find('textarea').element).toBe(textarea)
    expect(document.activeElement).toBe(textarea)
  })

  describe('choreography', () => {
    let calls: AnimateCall[]

    beforeEach(() => {
      calls = installWaapiStub()
    })

    const on = (className: string) => calls.filter(call => call.element.classList.contains(className))

    it('slides the card across when the tray swaps sides, over the leaving tray', async () => {
      const wrapper = mountHost()
      expect(calls).toHaveLength(0)

      await wrapper.setProps({ placement: 'top' })
      const root = wrapper.find('.tx-chat-composer').element

      // The arriving tray is in flow at once, under the card; it has no enter
      // styles to wait on (the style contract asserts that).
      const [top, bottom] = trays(root)
      expect(top?.classList.contains('is-top')).toBe(true)
      // The leaving one lingers out of flow while it fades.
      expect(bottom?.classList.contains('is-bottom')).toBe(true)
      expect(bottom?.classList.contains('tx-chat-composer-tray-leave-active')).toBe(true)

      const [slide] = on('tx-chat-composer__card')
      expect(on('tx-chat-composer__card')).toHaveLength(1)
      // FIRST (card at 0) minus LAST (card under a 44px top tray): starts one row up.
      expect(slide?.keyframes).toEqual([{ transform: `translateY(-${TRAY_ROW}px)` }, { transform: 'none' }])
      expect(slide?.options).toEqual(SLIDE_TIMING)

      // Equal trays: the outer box keeps its size, and nothing clips the card's shadow.
      expect(on('tx-chat-composer')).toHaveLength(0)
      expect(root.classList.contains('is-resizing')).toBe(false)

      await afterLeave()
      expect(trays(root)).toHaveLength(1)
      expect(trays(root)[0]?.textContent).toBe('Select a project')
    })

    it('slides back down the other way', async () => {
      const wrapper = mountHost({ placement: 'top' })

      await wrapper.setProps({ placement: 'bottom' })

      expect(on('tx-chat-composer__card')[0]?.keyframes).toEqual([
        { transform: `translateY(${TRAY_ROW}px)` },
        { transform: 'none' },
      ])
    })

    it('grows the shell when a tray arrives and ends the resize on finish', async () => {
      const wrapper = mountHost({ showTray: false })
      const root = wrapper.find('.tx-chat-composer')

      await wrapper.setProps({ showTray: true })

      // A bottom tray does not move the card; only the shell grows to uncover it.
      expect(on('tx-chat-composer__card')).toHaveLength(0)
      const [resize] = on('tx-chat-composer')
      expect(resize?.keyframes).toEqual([{ height: `${CARD_HEIGHT}px` }, { height: `${CARD_HEIGHT + TRAY_ROW}px` }])
      expect(resize?.options).toEqual(SLIDE_TIMING)
      expect(root.classes()).toEqual(expect.arrayContaining(['has-tray', 'is-resizing']))

      resize?.animation.finish()
      await nextTick()
      expect(root.classes()).not.toContain('is-resizing')
      expect(root.classes()).toContain('has-tray')
    })

    it('slides the card down and grows the shell when a top tray arrives', async () => {
      const wrapper = mountHost({ placement: 'top', showTray: false })

      await wrapper.setProps({ showTray: true })

      expect(on('tx-chat-composer__card')[0]?.keyframes).toEqual([
        { transform: `translateY(-${TRAY_ROW}px)` },
        { transform: 'none' },
      ])
      expect(on('tx-chat-composer')[0]?.keyframes).toEqual([
        { height: `${CARD_HEIGHT}px` },
        { height: `${CARD_HEIGHT + TRAY_ROW}px` },
      ])
    })

    it('keeps the tray fill through a removal until the shrink finishes', async () => {
      const wrapper = mountHost()
      const root = wrapper.find('.tx-chat-composer')

      await wrapper.setProps({ showTray: false })

      const [resize] = on('tx-chat-composer')
      expect(resize?.keyframes).toEqual([{ height: `${CARD_HEIGHT + TRAY_ROW}px` }, { height: `${CARD_HEIGHT}px` }])
      // The slot is gone, but the fill has to shrink away with the shell, not vanish first.
      expect(root.classes()).toEqual(expect.arrayContaining(['has-tray', 'is-resizing']))
      expect(root.classes()).not.toContain('is-tray-bottom')

      resize?.animation.finish()
      await nextTick()
      expect(root.classes()).not.toContain('has-tray')
      expect(root.classes()).not.toContain('is-resizing')
    })

    it('cancels a running slide when the tray changes again', async () => {
      const wrapper = mountHost()

      await wrapper.setProps({ placement: 'top' })
      const [first] = on('tx-chat-composer__card')
      await wrapper.setProps({ placement: 'bottom' })

      expect(first?.animation.cancelled).toBe(true)
      expect(on('tx-chat-composer__card')).toHaveLength(2)
    })

    it('ignores a late cancel from a resize it has already replaced', async () => {
      const wrapper = mountHost({ showTray: false })
      const root = wrapper.find('.tx-chat-composer')

      await wrapper.setProps({ showTray: true })
      const [growing] = on('tx-chat-composer')
      await wrapper.setProps({ showTray: false })
      expect(on('tx-chat-composer')).toHaveLength(2)

      // A browser reports the first cancel after the second resize has started.
      growing?.animation.oncancel?.()
      await nextTick()
      expect(root.classes()).toContain('is-resizing')
    })

    it('hands focus to the textarea when it was inside the leaving tray', async () => {
      const wrapper = mountHost()
      const action = wrapper.find<HTMLButtonElement>('.tray-action').element
      action.focus()
      expect(document.activeElement).toBe(action)

      await wrapper.setProps({ placement: 'top' })

      expect(document.activeElement).toBe(wrapper.find('textarea').element)
    })

    it('leaves focus alone when it was not in the leaving tray', async () => {
      const wrapper = mountHost()
      const outside = document.createElement('button')
      document.body.appendChild(outside)
      outside.focus()

      await wrapper.setProps({ placement: 'top' })

      expect(document.activeElement).toBe(outside)
      outside.remove()
    })

    it('lands on the final layout at once under reduced motion', async () => {
      stubReducedMotion(true)
      const wrapper = mountHost()
      const root = wrapper.find('.tx-chat-composer').element

      await wrapper.setProps({ placement: 'top' })

      expect(calls).toHaveLength(0)
      // No fade either: the old tray is gone in the same update.
      expect(trays(root).map(el => el.classList.contains('is-top'))).toEqual([true])
      expect(root.classList.contains('is-resizing')).toBe(false)

      await wrapper.setProps({ showTray: false })
      expect(calls).toHaveLength(0)
      expect(trays(root)).toHaveLength(0)
      expect(root.classList.contains('has-tray')).toBe(false)
    })

    it('still hands focus over under reduced motion', async () => {
      stubReducedMotion(true)
      const wrapper = mountHost()
      wrapper.find<HTMLButtonElement>('.tray-action').element.focus()

      await wrapper.setProps({ placement: 'top' })

      expect(document.activeElement).toBe(wrapper.find('textarea').element)
    })
  })

  it('settles at once where there is no Web Animations API', async () => {
    // jsdom's own state: no `animate` on elements.
    expect(typeof HTMLElement.prototype.animate).not.toBe('function')
    const wrapper = mountHost()
    const root = wrapper.find('.tx-chat-composer').element

    await wrapper.setProps({ placement: 'top' })

    expect(trays(root).map(el => el.classList.contains('is-top'))).toEqual([true])
    expect(root.classList.contains('is-resizing')).toBe(false)
  })

  it('renders on the server with the tray on its side of the card', async () => {
    const html = await renderToString(h(
      TxChatComposer,
      { trayPlacement: 'top', trayLabel: 'Project' },
      { tray: () => 'Select a project' },
    ))

    expect(html).toContain('tx-chat-composer__tray is-top')
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="Project"')
    expect(html.indexOf('tx-chat-composer__tray')).toBeLessThan(html.indexOf('tx-chat-composer__card'))
    expect(html).toContain('Select a project')
  })
})
