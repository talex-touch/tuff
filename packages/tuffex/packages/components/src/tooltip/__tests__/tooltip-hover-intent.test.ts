import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { ANCHOR_DELAY_PRESETS, createAnchorDelayService, provideAnchorDelayService } from '../../../../utils/anchor-delay'
import { HOVER_TRANSIT_STALL_MS, resetHoverIntent } from '../../../../utils/hover-intent'
import TxPopover from '../../popover/src/TxPopover.vue'
import TxTooltip from '../src/TxTooltip.vue'

/**
 * Layout for jsdom, which has none: every element reads its rect from here.
 * The arrangement is a toolbar — trigger A at x 400, trigger B to its left at
 * x 360 — with A's menu below, right edges aligned, 10px down.
 */
const rects = new WeakMap<Element, DOMRect>()
const TRIGGER_A = DOMRect.fromRect({ x: 400, y: 20, width: 32, height: 32 })
const TRIGGER_B = DOMRect.fromRect({ x: 360, y: 20, width: 32, height: 32 })
const PANEL_A = DOMRect.fromRect({ x: 212, y: 62, width: 220, height: 140 })

/**
 * The anchor as TxTooltip sees it: its floating layer reports enter/leave, and
 * it exposes the geometry the hover transit reads.
 */
const BaseAnchorStub = defineComponent({
  name: 'TxBaseAnchor',
  props: {
    modelValue: { type: Boolean, default: false },
    hoverBridge: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'floating-enter', 'floating-leave'],
  setup(props, { slots, emit, expose }) {
    const panel = ref<HTMLElement | null>(null)
    expose({
      getPanelRect: () => panel.value?.getBoundingClientRect() ?? null,
      containsFloating: (target: Node) => !!panel.value?.contains(target),
      getSide: () => 'bottom',
    })
    return () => h('div', { class: 'stub-anchor' }, [
      slots.reference?.(),
      props.modelValue
        ? h('div', {
            ref: panel,
            class: 'stub-panel',
            onMouseenter: (event: MouseEvent) => emit('floating-enter', event),
            onMouseleave: (event: MouseEvent) => emit('floating-leave', event),
          }, slots.default?.({ side: 'bottom' }))
        : null,
    ])
  },
})

const Toolbar = defineComponent({
  components: { TxPopover, TxTooltip },
  template: `
    <div>
      <TxPopover trigger="hover">
        <template #reference><button class="a">A</button></template>
        <div class="menu-a">menu A</div>
      </TxPopover>
      <TxPopover trigger="hover">
        <template #reference><button class="b">B</button></template>
        <div class="menu-b">menu B</div>
      </TxPopover>
      <TxTooltip content="hint"><button class="hint">?</button></TxTooltip>
    </div>
  `,
})

function mountToolbar() {
  const service = createAnchorDelayService()
  return mount(Toolbar, {
    attachTo: document.body,
    global: {
      stubs: { TxBaseAnchor: BaseAnchorStub },
      plugins: [{ install: (app: never) => provideAnchorDelayService(app as never, service) }],
    },
  })
}

function referenceOf(wrapper: ReturnType<typeof mount>, selector: string) {
  return wrapper.find(selector).element.closest('.tx-tooltip__reference') as HTMLElement
}

function anchorOf(wrapper: ReturnType<typeof mount>, selector: string) {
  return wrapper.findAllComponents(BaseAnchorStub).find(anchor => anchor.find(selector).exists())!
}

function isOpen(wrapper: ReturnType<typeof mount>, selector: string) {
  return anchorOf(wrapper, selector).props('modelValue') as boolean
}

async function pointer(target: Element, type: string, x: number, y: number) {
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: type === 'pointermove' }))
  await nextTick()
}

async function openA(wrapper: ReturnType<typeof mount>) {
  await pointer(referenceOf(wrapper, '.a'), 'mouseenter', 416, 36)
  vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.menu.openDelay)
  await nextTick()
  rects.set(wrapper.find('.menu-a').element.closest('.stub-panel')!, PANEL_A)
  expect(isOpen(wrapper, '.a')).toBe(true)
}

const closeDelay = ANCHOR_DELAY_PRESETS.layers.menu.closeDelay

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return rects.get(this) ?? DOMRect.fromRect()
  })
})

afterEach(() => {
  resetHoverIntent()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('tooltip hover intent', () => {
  it('gives the bridge to hover panels only', () => {
    const wrapper = mountToolbar()

    expect(anchorOf(wrapper, '.a').props('hoverBridge')).toBe(true)
    // A hint has nothing to travel to.
    expect(anchorOf(wrapper, '.hint').props('hoverBridge')).toBe(false)
  })

  it('keeps the menu open while the pointer travels towards it, past the close delay', async () => {
    const wrapper = mountToolbar()
    rects.set(referenceOf(wrapper, '.a'), TRIGGER_A)
    await openA(wrapper)

    // Out of the trigger's left side, heading down-left for the menu's far end.
    await pointer(referenceOf(wrapper, '.a'), 'mouseleave', 399, 40)
    for (let i = 1; i <= 6; i++) {
      vi.advanceTimersByTime(50)
      await pointer(document.body, 'pointermove', 399 - i * 12, 40 + i * 3)
    }
    expect(isOpen(wrapper, '.a')).toBe(true)

    // Off course: back to the delay it always had.
    await pointer(document.body, 'pointermove', 300, 30)
    vi.advanceTimersByTime(closeDelay)
    await nextTick()
    expect(isOpen(wrapper, '.a')).toBe(false)
  })

  it('does not open a trigger the pointer crosses on its way, and opens it once the pointer stops there', async () => {
    const wrapper = mountToolbar()
    rects.set(referenceOf(wrapper, '.a'), TRIGGER_A)
    rects.set(referenceOf(wrapper, '.b'), TRIGGER_B)
    await openA(wrapper)

    await pointer(referenceOf(wrapper, '.a'), 'mouseleave', 399, 44)
    await pointer(document.body, 'pointermove', 392, 47)
    // B's lower edge lies inside A's triangle; the pointer keeps moving across
    // it for longer than B's open delay.
    const b = referenceOf(wrapper, '.b')
    await pointer(b, 'mouseenter', 386, 49)
    for (let i = 1; i <= 4; i++) {
      vi.advanceTimersByTime(40)
      await pointer(b, 'pointermove', 386 - i * 2, 49 + i * 0.5)
    }
    expect(isOpen(wrapper, '.b')).toBe(false)
    expect(isOpen(wrapper, '.a')).toBe(true)

    // The pointer rests on B: that is the user choosing B.
    vi.advanceTimersByTime(HOVER_TRANSIT_STALL_MS)
    await nextTick()
    vi.runOnlyPendingTimers()
    await nextTick()
    expect(isOpen(wrapper, '.b')).toBe(true)
    expect(isOpen(wrapper, '.a')).toBe(false)
  })

  it('lands without a close when the pointer reaches the panel', async () => {
    const wrapper = mountToolbar()
    rects.set(referenceOf(wrapper, '.a'), TRIGGER_A)
    await openA(wrapper)

    await pointer(referenceOf(wrapper, '.a'), 'mouseleave', 399, 44)
    vi.advanceTimersByTime(60)
    await pointer(wrapper.find('.menu-a').element.closest('.stub-panel')!, 'mouseenter', 380, 70)
    vi.advanceTimersByTime(closeDelay * 5)
    await nextTick()
    expect(isOpen(wrapper, '.a')).toBe(true)
  })

  it('closes on the usual delay when the pointer leaves through the far edge', async () => {
    const wrapper = mountToolbar()
    rects.set(referenceOf(wrapper, '.a'), TRIGGER_A)
    await openA(wrapper)

    await pointer(referenceOf(wrapper, '.a'), 'mouseleave', 416, 19)
    vi.advanceTimersByTime(closeDelay)
    await nextTick()
    expect(isOpen(wrapper, '.a')).toBe(false)
  })
})
