import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import {
  ANCHOR_DELAY_PRESETS,
  createAnchorDelayService,
  provideAnchorDelayService,
} from '../../../../utils/anchor-delay'
import TxTooltip from '../src/TxTooltip.vue'

const BaseAnchorStub = defineComponent({
  name: 'TxBaseAnchor',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'open', 'close'],
  template: `
    <div class="tx-base-anchor-stub" :data-open="String(modelValue)">
      <slot name="reference" />
      <slot :side="'top'" />
    </div>
  `,
})

/**
 * Two tooltips side by side, sharing one app so they share one service — the
 * arrangement the whole feature exists for.
 */
const TwoTooltips = defineComponent({
  components: { TxTooltip },
  template: `
    <div>
      <TxTooltip ref="a" content="A"><button class="a">A</button></TxTooltip>
      <TxTooltip ref="b" content="B"><button class="b">B</button></TxTooltip>
    </div>
  `,
})

function mountWithService(component: unknown) {
  const service = createAnchorDelayService()
  const wrapper = mount(component as never, {
    global: {
      stubs: { TxBaseAnchor: BaseAnchorStub },
      plugins: [{ install: (app: never) => provideAnchorDelayService(app as never, service) }],
    },
  })
  return { wrapper, service }
}

/**
 * The INNERMOST anchor wrapping `selector`.
 *
 * `findAll` returns document order, so for a tooltip nested inside a popover the
 * first match is the popover — reading that one made the nested assertion report
 * the panel's state under the tooltip's name, and pass no matter what.
 */
function isOpen(wrapper: ReturnType<typeof mount>, selector: string) {
  const matches = wrapper.findAll('.tx-base-anchor-stub')
    .filter(node => node.find(selector).exists())
  return matches.at(-1)?.attributes('data-open')
}

/**
 * `mouseenter` does not bubble, and the handler sits on the reference wrapper —
 * dispatching on the inner button would never reach it.
 */
function hover(wrapper: ReturnType<typeof mount>, selector: string, event: 'mouseenter' | 'mouseleave') {
  const host = wrapper.findAll('.tx-tooltip__reference, .tx-popover__reference')
    .find(node => node.find(selector).exists())
  if (!host)
    throw new Error(`no anchor reference wraps ${selector}`)
  return host.trigger(event)
}

describe('tooltip mutual exclusion through the anchor delay service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens after the hint openDelay rather than immediately', async () => {
    const { wrapper } = mountWithService(TwoTooltips)

    await hover(wrapper, 'button.a', 'mouseenter')
    vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.hint.openDelay - 1)
    await nextTick()
    expect(isOpen(wrapper, 'button.a')).toBe('false')

    vi.advanceTimersByTime(1)
    await nextTick()
    expect(isOpen(wrapper, 'button.a')).toBe('true')

    wrapper.unmount()
  })

  it('closes the first tooltip the moment the second opens', async () => {
    const { wrapper } = mountWithService(TwoTooltips)

    await hover(wrapper, 'button.a', 'mouseenter')
    vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.hint.openDelay)
    await nextTick()
    expect(isOpen(wrapper, 'button.a')).toBe('true')

    // Leaving A starts its closeDelay; arriving at B is what must cut it short.
    await hover(wrapper, 'button.a', 'mouseleave')
    await hover(wrapper, 'button.b', 'mouseenter')

    // The group is warm, so B opens on the next tick — still far inside A's
    // 120ms closeDelay, which is precisely the bug this replaces.
    vi.advanceTimersByTime(0)
    await nextTick()

    expect(isOpen(wrapper, 'button.b')).toBe('true')
    expect(isOpen(wrapper, 'button.a')).toBe('false')

    wrapper.unmount()
  })

  it('opens the second tooltip with no wait while the group is warm', async () => {
    const { wrapper } = mountWithService(TwoTooltips)

    await hover(wrapper, 'button.a', 'mouseenter')
    vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.hint.openDelay)
    await nextTick()

    await hover(wrapper, 'button.b', 'mouseenter')
    vi.advanceTimersByTime(0)
    await nextTick()

    // A cold open would still be 200ms away at this point.
    expect(isOpen(wrapper, 'button.b')).toBe('true')

    wrapper.unmount()
  })

  it('leaves the carrying popover open when a tooltip inside it opens', async () => {
    const NestedTooltip = defineComponent({
      components: { TxPopover, TxTooltip },
      template: `
        <TxPopover trigger="hover" ref="pop">
          <template #reference><button class="pop">open</button></template>
          <TxTooltip content="inner"><button class="inner">i</button></TxTooltip>
        </TxPopover>
      `,
    })

    const { wrapper } = mountWithService(NestedTooltip)

    await hover(wrapper, 'button.pop', 'mouseenter')
    vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.menu.openDelay)
    await nextTick()
    expect(isOpen(wrapper, 'button.pop')).toBe('true')

    // Both halves matter. Asserting only that the popover stayed open would pass
    // vacuously — a suppressed tooltip never opens, so nothing could have closed
    // the popover in the first place.
    await hover(wrapper, 'button.inner', 'mouseenter')
    vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.hint.openDelay)
    await nextTick()

    expect(isOpen(wrapper, 'button.inner')).toBe('true')
    expect(isOpen(wrapper, 'button.pop')).toBe('true')

    wrapper.unmount()
  })

  it('unregisters on unmount so a gone tooltip stops preempting', async () => {
    const { wrapper, service } = mountWithService(TwoTooltips)

    await hover(wrapper, 'button.a', 'mouseenter')
    vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.hint.openDelay)
    await nextTick()
    expect(service.openNodes()).toHaveLength(1)

    wrapper.unmount()
    expect(service.openNodes()).toHaveLength(0)
  })
})
