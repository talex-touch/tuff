import type { SelectionPayload } from '../src/types'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, shallowRef } from 'vue'
import TxSelectionActions from '../src/TxSelectionActions.vue'

/**
 * A virtual reference gives floating-ui nothing to observe, so TxBaseAnchor
 * only re-runs positioning on window resize and scroll — text reflowing under a
 * streaming rewrite moves the selection without either. The bar therefore has
 * to be repositioned by hand, and this file proves that `updatePosition()`
 * actually reaches floating-ui's `update` rather than merely existing.
 */
const updateSpy = vi.fn()

vi.mock('@floating-ui/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@floating-ui/vue')>()

  return {
    ...actual,
    useFloating: () => ({
      floatingStyles: computed(() => ({})),
      middlewareData: shallowRef({}),
      placement: ref('bottom'),
      x: ref(0),
      y: ref(0),
      strategy: ref('fixed'),
      isPositioned: ref(true),
      update: updateSpy,
    }),
  }
})

function selection(): SelectionPayload {
  return {
    text: 'Churn it first thing Saturday.',
    rects: [{ top: 100, bottom: 118, left: 40, right: 300, width: 260, height: 18 } as DOMRect],
  }
}

const mounted: Array<{ unmount: () => void }> = []

beforeEach(() => {
  updateSpy.mockClear()
})

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  document.body.innerHTML = ''
})

describe('txSelectionActions positioning', () => {
  it('forwards updatePosition all the way to floating-ui', async () => {
    const wrapper = mount(TxSelectionActions, {
      attachTo: document.body,
      props: { selection: selection() },
    })
    mounted.push(wrapper)
    await wrapper.vm.$nextTick()

    const before = updateSpy.mock.calls.length
    ;(wrapper.vm as unknown as { updatePosition: () => void }).updatePosition()

    expect(updateSpy.mock.calls.length).toBeGreaterThan(before)
  })

  it('is a no-op rather than a throw while the bar is retracted', () => {
    const wrapper = mount(TxSelectionActions, {
      attachTo: document.body,
      props: { selection: null },
    })
    mounted.push(wrapper)

    expect(() => (wrapper.vm as unknown as { updatePosition: () => void }).updatePosition()).not.toThrow()
  })
})
