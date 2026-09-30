// @vitest-environment jsdom
import type { RecommendationSource, TuffItem, TuffRender } from '@talex-touch/utils'
import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BoxItem from './BoxItem.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    // Renders `key(param=value)` for object params and falls back to the key for plain lookups, so
    // the assertion names the fact that was chosen rather than the final wording of any locale.
    t: (key: string, params?: unknown) => {
      if (typeof params === 'string') return params
      if (!params || typeof params !== 'object') return key
      const rendered = Object.entries(params as Record<string, unknown>)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')
      return `${key}(${rendered})`
    }
  })
}))

vi.mock('~/modules/openers', () => ({
  getOpenerByExtension: vi.fn(() => null),
  useOpenerAutoResolve: vi.fn()
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: {
    name: 'TxIcon',
    props: ['icon', 'colorful', 'size', 'alt', 'empty'],
    template: '<span class="tx-icon-stub" />'
  }
}))

const render: TuffRender = {
  mode: 'default',
  basic: { title: 'Calculator', icon: { type: 'class', value: 'i-ri-apps-line' } }
} as TuffRender

function createItem(recommendation?: {
  source?: RecommendationSource
  evidence?: Record<string, unknown>
  reason?: string
}): TuffItem {
  return {
    id: 'app-provider:/Applications/Calculator.app',
    source: { type: 'application', id: 'app-provider', name: 'Applications' },
    kind: 'app',
    render,
    meta: recommendation ? { recommendation } : {}
  } as TuffItem
}

/** The reason sentence the row actually renders, or null when it renders none. */
function reason(wrapper: VueWrapper): string | null {
  const span = wrapper.find('.RecommendationEvidence')
  return span.exists() ? span.text() : null
}

afterEach(() => {
  vi.useRealTimers()
})

describe('BoxItem recommendation reason', () => {
  it('shows the reason a source can actually justify from its own evidence', () => {
    // A dated last-execution is the fact that explains "recent", so it renders a localized sentence.
    const dated = mount(BoxItem, {
      props: {
        item: createItem({
          source: 'recent',
          evidence: { lastExecutedAt: Date.now() - 2 * 3_600_000 }
        }),
        active: false,
        render
      }
    })
    expect(reason(dated)).toContain('corebox.evidence.lastUsed')

    // A peak range is what explains "此时常用".
    const peak = mount(BoxItem, {
      props: {
        item: createItem({
          source: 'time-based',
          evidence: { peakHourRange: { startHour: 9, endHour: 11 } }
        }),
        active: false,
        render
      }
    })
    expect(reason(peak)).toContain('corebox.evidence.peakHours')
  })

  it('shows no reason for a recent item that only has a count, never a fabricated one', () => {
    // R9: counts belong to "常用"; an item with no dated execution has no recent reason, and a
    // count is not a substitute. The number itself stays on the row's usage counter.
    const wrapper = mount(BoxItem, {
      props: {
        item: createItem({ source: 'recent', evidence: { executeCount: 12 } }),
        active: false,
        render
      }
    })

    expect(reason(wrapper)).toBeNull()
  })

  it('shows no time-based reason when the item has executions but no hour pattern', () => {
    const wrapper = mount(BoxItem, {
      props: {
        item: createItem({ source: 'time-based', evidence: { executeCount: 30 } }),
        active: false,
        render
      }
    })

    expect(reason(wrapper)).toBeNull()
  })

  it('says nothing for a recommendation the rebuilder could not justify', () => {
    const noEvidence = mount(BoxItem, {
      props: { item: createItem({ source: 'frequent' }), active: false, render }
    })
    expect(reason(noEvidence)).toBeNull()

    const emptyEvidence = mount(BoxItem, {
      props: { item: createItem({ source: 'frequent', evidence: {} }), active: false, render }
    })
    expect(reason(emptyEvidence)).toBeNull()

    const notRecommended = mount(BoxItem, {
      props: { item: createItem(), active: false, render }
    })
    expect(reason(notRecommended)).toBeNull()
  })
})
