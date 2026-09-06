import type { MockInstance } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxBaseAnchor from '../src/TxBaseAnchor.vue'

vi.mock('gsap', () => {
  const timeline = () => ({ to: vi.fn().mockReturnThis(), kill: vi.fn() })
  return {
    default: {
      set: vi.fn(),
      timeline,
    },
  }
})

const CardStub = defineComponent({
  name: 'TxCard',
  props: {
    variant: { type: String, default: undefined },
    background: { type: String, default: undefined },
    shadow: { type: String, default: undefined },
    radius: { type: Number, default: undefined },
    padding: { type: Number, default: undefined },
    surfaceMoving: { type: Boolean, default: undefined },
    maskOpacity: { type: Number, default: undefined },
  },
  template: '<div class="tx-card-stub"><slot /></div>',
})

/**
 * `.tx-base-anchor__card` / `__content` / `__liquid-panel` read
 * `max-height: var(--tx-ba-max-height, 420px)`. The `size` middleware is the
 * only writer of that custom property (`min(availableHeight, maxHeight)` in px,
 * or `none` when unlimited). Every write goes through `setProperty`, so spying
 * on it yields the complete ownership history of the declaration.
 */
const MAX_HEIGHT_VAR = '--tx-ba-max-height'
const PX_VALUE = /^\d+(?:\.\d+)?px$/

type SetPropertySpy = MockInstance<(name: string, value: string | null, priority?: string) => void>

const TALL_CONTENT = `<ul class="tall-list">${Array.from({ length: 40 }, (_, index) => `<li>Row ${index + 1}</li>`).join('')}</ul>`

// Teleported panels outlive `document.body.innerHTML = ''`; without unmounting,
// a stale instance can re-insert its content and shadow the current test's DOM.
const mountedAnchors: Array<{ unmount: () => void }> = []

function cleanupAnchors() {
  while (mountedAnchors.length) mountedAnchors.pop()?.unmount()
  document.body.innerHTML = ''
}

function mountAnchor(props: Record<string, unknown>) {
  const wrapper = mount(TxBaseAnchor, {
    attachTo: document.body,
    props,
    slots: {
      reference: '<button class="reference-button">Reference</button>',
      default: TALL_CONTENT,
    },
    global: {
      stubs: { TxCard: CardStub },
    },
  })
  mountedAnchors.push(wrapper)
  return wrapper
}

/**
 * The open path waits for floating-ui's first positioning pass and a stable
 * panel size before starting the open motion. Let that pipeline drain on the
 * real clock so the middleware has written, and the resulting re-renders have
 * run, before anything is asserted.
 */
async function settleOpen() {
  await vi.dynamicImportSettled()
  await new Promise(resolve => setTimeout(resolve, 120))
  await flushPromises()
}

/** Calls through to the real `setProperty`; only observes. */
function spyOnSetProperty(): SetPropertySpy {
  return vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')
}

/** Every `--tx-ba-max-height` value written to `style`, in call order. */
function maxHeightWrites(spy: SetPropertySpy, style: CSSStyleDeclaration): string[] {
  return spy.mock.calls.flatMap(([name, value], index) => {
    if (name !== MAX_HEIGHT_VAR || spy.mock.contexts[index] !== style)
      return []
    return [value ?? '']
  })
}

function floatingRoot(): HTMLElement {
  const el = document.body.querySelector<HTMLElement>('.tx-base-anchor')
  if (!el)
    throw new Error('floating root did not mount')
  return el
}

describe('txBaseAnchor max-height ownership', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanupAnchors()
  })

  it('keeps the size-middleware value through the open settle and later re-renders', async () => {
    const spy = spyOnSetProperty()
    const wrapper = mountAnchor({ modelValue: true, maxHeight: 320 })
    await settleOpen()

    const el = floatingRoot()
    let writes = maxHeightWrites(spy, el.style)

    // Positive control: the middleware actually ran and wrote a pixel value.
    // jsdom has no layout, so the number is whatever it computed (0), which is
    // why the assertions below compare against the recorded write rather than
    // a hard-coded px.
    const middlewareValues = writes.filter(value => PX_VALUE.test(value))
    expect(middlewareValues.length).toBeGreaterThan(0)

    // Nobody may clear the declaration once the middleware owns it. The old
    // root `:style` binding did exactly that: Vue turns an `undefined` custom
    // property into `setProperty(name, '')` on every re-render, so the value
    // was deleted right after each positioning pass and the CSS fell back to
    // the 420px default.
    expect(writes).not.toContain('')
    expect(el.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe(writes.at(-1))

    // Force a full re-render of the anchor (new props patch the root element,
    // including its `:style`) and prove the declaration survives it.
    await wrapper.setProps({ offset: 9 })
    await nextTick()
    await flushPromises()

    writes = maxHeightWrites(spy, el.style)
    expect(writes).not.toContain('')
    expect(PX_VALUE.test(writes.at(-1) ?? '')).toBe(true)
    expect(el.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe(writes.at(-1))
  })

  it('keeps `none` for unlimited-height panels through the open settle and later re-renders', async () => {
    const spy = spyOnSetProperty()
    const wrapper = mountAnchor({ modelValue: true, unlimitedHeight: true })
    await settleOpen()

    const el = floatingRoot()
    expect(el.classList.contains('is-unlimited-height')).toBe(true)
    expect(maxHeightWrites(spy, el.style)).toContain('none')
    expect(el.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe('none')

    await wrapper.setProps({ offset: 9 })
    await nextTick()
    await flushPromises()

    expect(maxHeightWrites(spy, el.style)).not.toContain('')
    expect(el.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe('none')
  })
})
