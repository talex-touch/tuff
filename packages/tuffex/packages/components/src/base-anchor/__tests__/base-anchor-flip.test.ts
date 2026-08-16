import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, shallowRef, toValue } from 'vue'
import TxBaseAnchor from '../src/TxBaseAnchor.vue'

/**
 * The middleware list is not observable from the rendered DOM, so `useFloating`
 * is intercepted to record the options it was handed. Everything else in
 * `@floating-ui/vue` — including the real `flip` / `shift` / `size` / `arrow`
 * factories whose `name` fields these assertions read — is the genuine module.
 */
const capturedOptions: Array<Record<string, unknown>> = []

vi.mock('@floating-ui/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@floating-ui/vue')>()

  return {
    ...actual,
    useFloating: (_reference: unknown, _floating: unknown, options: Record<string, unknown>) => {
      capturedOptions.push(options)
      return {
        floatingStyles: computed(() => ({})),
        middlewareData: shallowRef({}),
        placement: ref('bottom-start'),
        x: ref(0),
        y: ref(0),
        strategy: ref('fixed'),
        isPositioned: ref(false),
        update: vi.fn(),
      }
    },
  }
})

function middlewareNames(index = 0): string[] {
  const list = toValue(capturedOptions[index]?.middleware) as Array<{ name: string }> | undefined
  return (list ?? []).map(entry => entry.name)
}

function mountAnchor(props: Record<string, unknown> = {}) {
  return mount(TxBaseAnchor, {
    props,
    slots: {
      reference: '<button class="reference-button">Reference</button>',
      default: '<div class="floating-content">Floating</div>',
    },
  })
}

beforeEach(() => {
  capturedOptions.length = 0
})

describe('txBaseAnchor disableFlip', () => {
  it('keeps the default middleware chain, flip included, when the prop is omitted', () => {
    mountAnchor()

    expect(middlewareNames()).toEqual(['offset', 'flip', 'shift', 'size', 'arrow'])
  })

  it('is identical when the prop is passed as false', () => {
    mountAnchor({ disableFlip: false })

    expect(middlewareNames()).toEqual(['offset', 'flip', 'shift', 'size', 'arrow'])
  })

  it('leaves flip out — and only flip — when disabled', () => {
    mountAnchor({ disableFlip: true })

    expect(middlewareNames()).toEqual(['offset', 'shift', 'size', 'arrow'])
  })

  it('keeps flip padding at 8 so the default collision inset is untouched', () => {
    mountAnchor()

    const list = toValue(capturedOptions[0]?.middleware) as Array<{ name: string, options: unknown }>
    const flipEntry = list.find(entry => entry.name === 'flip')
    expect(flipEntry?.options).toEqual({ padding: 8 })
  })

  it('re-resolves the chain when the prop flips at runtime', async () => {
    const wrapper = mountAnchor({ disableFlip: false })
    expect(middlewareNames()).toContain('flip')

    await wrapper.setProps({ disableFlip: true })
    expect(middlewareNames()).not.toContain('flip')

    await wrapper.setProps({ disableFlip: false })
    expect(middlewareNames()).toContain('flip')
  })

  it('does not disturb the other positioning options', () => {
    mountAnchor()

    expect(capturedOptions[0]?.strategy).toBe('fixed')
    expect(capturedOptions[0]?.transform).toBe(false)
    expect(toValue(capturedOptions[0]?.placement)).toBe('bottom-start')
  })

  it('holds the middleware list identity steady while unrelated props change', async () => {
    const wrapper = mountAnchor({ offset: 8 })
    const first = toValue(capturedOptions[0]?.middleware)

    await wrapper.setProps({ offset: 24, maxWidth: 500 })
    expect(toValue(capturedOptions[0]?.middleware)).toBe(first)
  })
})
