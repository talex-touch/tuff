// @vitest-environment jsdom
import type { Component } from 'vue'
import type { RecommendationSource, TuffItem, TuffRender } from '@talex-touch/utils'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import enUS from '../../modules/lang/en-US.json'
import BoxGridItem from './BoxGridItem.vue'
import BoxItem from './BoxItem.vue'

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

/**
 * The real locale bundle with a real vue-i18n instance, so a row that renders the wrong KEY or the
 * wrong params is caught. Copy is read back out of the bundle rather than written here: the
 * contract is "which fact, with which numbers", not the wording, so a reworded string must not
 * redden these tests.
 */
const catalogue = enUS as unknown as Record<string, unknown>

function message(path: string, params: Record<string, string | number> = {}): string {
  const template = path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      catalogue
    )
  if (typeof template !== 'string') throw new Error(`locale is missing ${path}`)
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name]))
}

const i18n = createI18n({
  fallbackLocale: 'en-US',
  fallbackWarn: false,
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': enUS },
  missingWarn: false
})

const render: TuffRender = {
  mode: 'default',
  basic: { title: 'Calculator', icon: { type: 'class', value: 'i-ri-apps-line' } }
} as TuffRender

const HOUR = 3_600_000

interface ItemMeta {
  usageStats?: { executeCount: number }
  recommendation?: {
    source: RecommendationSource
    badge?: { variant: string; icon?: string; text: string }
    evidence?: Record<string, unknown>
  }
}

function createItem(kind: TuffItem['kind'], meta: ItemMeta = {}): TuffItem {
  return {
    id: `${kind}-provider:/Applications/Calculator`,
    source: { type: 'application', id: 'app-provider', name: 'Applications' },
    kind,
    render,
    meta
  } as TuffItem
}

/** The props both row components share; naming them keeps the mount options checkable. */
interface RowProps {
  item: TuffItem
  active: boolean
  render: TuffRender
}

function mountItem(component: Component, item: TuffItem): VueWrapper {
  return mount(component as Component<RowProps>, {
    global: { plugins: [i18n] },
    props: { active: false, item, render }
  })
}

function reasonText(wrapper: VueWrapper): string | null {
  const span = wrapper.find('.RecommendationEvidence')
  return span.exists() ? span.text() : null
}

function usageSpan(wrapper: VueWrapper) {
  return wrapper.find('[data-corebox-usage-count]')
}

function badge(wrapper: VueWrapper) {
  return wrapper.find('.BoxGridItem-Badge')
}

const BADGE = {
  variant: 'frequent',
  icon: 'i-ri-fire-line',
  text: '$i18n:coreBox.recommendation.badge.frequent'
}

const PINNED_BADGE = {
  variant: 'frequent',
  icon: 'i-ri-pushpin-line',
  text: '$i18n:coreBox.recommendation.badge.pinned'
}

describe('BoxItem visible reason and usage count', () => {
  it('renders the localized "used ago" sentence for an item with a dated execution', () => {
    const wrapper = mountItem(
      BoxItem,
      createItem('app', {
        recommendation: { source: 'recent', evidence: { lastExecutedAt: Date.now() - 3 * HOUR } }
      })
    )

    expect(reasonText(wrapper)).toBe(
      message('corebox.evidence.lastUsed', {
        age: message('corebox.evidence.age.hours', { count: 3 })
      })
    )
  })

  it('shows no reason when a known source is missing its own fact, even with a count present', () => {
    // The count is real, but it explains "常用", not "recent": borrowing it would print a true
    // sentence for the wrong claim (R9). The row must simply say nothing.
    const recent = mountItem(
      BoxItem,
      createItem('app', {
        usageStats: { executeCount: 12 },
        recommendation: { source: 'recent', evidence: { executeCount: 12 } }
      })
    )
    expect(reasonText(recent)).toBeNull()

    // Same for "此时常用": executions without an hour pattern are not evidence of a time habit.
    const timeBased = mountItem(
      BoxItem,
      createItem('app', {
        usageStats: { executeCount: 30 },
        recommendation: { source: 'time-based', evidence: { executeCount: 30 } }
      })
    )
    expect(reasonText(timeBased)).toBeNull()
  })

  it('keeps the numeric usage count on the row when no reason can be shown', () => {
    const wrapper = mountItem(
      BoxItem,
      createItem('feature', {
        usageStats: { executeCount: 12 },
        recommendation: { source: 'recent', evidence: { executeCount: 12 } }
      })
    )

    // No justified reason...
    expect(reasonText(wrapper)).toBeNull()
    // ...but the honest count stays, with its own object named.
    expect(usageSpan(wrapper).text()).toBe('12')
    expect(usageSpan(wrapper).attributes('title')).toBe(
      message('corebox.usage.useCount', { count: 12 })
    )
  })

  it('names what the count counts instead of conflating app launches with item uses', () => {
    const app = mountItem(BoxItem, createItem('app', { usageStats: { executeCount: 3 } }))
    const feature = mountItem(BoxItem, createItem('feature', { usageStats: { executeCount: 3 } }))

    expect(app.find('[data-corebox-usage-count]').attributes('title')).toBe(
      message('corebox.usage.launchCount', { count: 3 })
    )
    expect(feature.find('[data-corebox-usage-count]').attributes('title')).toBe(
      message('corebox.usage.useCount', { count: 3 })
    )
  })

  it('re-renders the count when the same item reports a new execution', async () => {
    // The host updates usage in place on the visible row; the number the user reads must follow.
    const wrapper = mountItem(BoxItem, createItem('app', { usageStats: { executeCount: 4 } }))
    expect(usageSpan(wrapper).text()).toBe('4')

    await wrapper.setProps({ item: createItem('app', { usageStats: { executeCount: 5 } }) })

    expect(usageSpan(wrapper).text()).toBe('5')
    expect(usageSpan(wrapper).attributes('title')).toBe(
      message('corebox.usage.launchCount', { count: 5 })
    )
  })

  it('refreshes the reason when the item reports a newer execution', async () => {
    const wrapper = mountItem(
      BoxItem,
      createItem('app', {
        recommendation: { source: 'recent', evidence: { lastExecutedAt: Date.now() - 3 * HOUR } }
      })
    )
    expect(reasonText(wrapper)).toBe(
      message('corebox.evidence.lastUsed', {
        age: message('corebox.evidence.age.hours', { count: 3 })
      })
    )

    await wrapper.setProps({
      item: createItem('app', {
        recommendation: { source: 'recent', evidence: { lastExecutedAt: Date.now() - 60_000 } }
      })
    })

    expect(reasonText(wrapper)).toBe(message('corebox.evidence.justUsed'))
  })
})

describe('BoxGridItem badge title and count', () => {
  it('shows the honest count with a title that names what is being counted', () => {
    const wrapper = mountItem(
      BoxGridItem,
      createItem('app', {
        usageStats: { executeCount: 5 },
        recommendation: { source: 'frequent', badge: BADGE, evidence: { executeCount: 5 } }
      })
    )

    // The count is appended to the badge body as the real number, and its own title says whether
    // it is app launches or item uses -- the two must not be conflated.
    const count = badge(wrapper).find('[data-corebox-usage-count]')
    expect(count.text()).toBe('· 5')
    expect(count.attributes('title')).toBe(message('corebox.usage.launchCount', { count: 5 }))
    // The badge title carries the reason, not a second copy of the count.
    expect(badge(wrapper).attributes('title')).toBe(
      message('corebox.evidence.opened', { count: 5 })
    )
  })

  it('never prints a zero count on a tile that has never been used', () => {
    const wrapper = mountItem(
      BoxGridItem,
      createItem('app', {
        usageStats: { executeCount: 0 },
        recommendation: { source: 'pinned', badge: BADGE }
      })
    )

    expect(badge(wrapper).find('[data-corebox-usage-count]').exists()).toBe(false)
    expect(badge(wrapper).text()).not.toContain('· 0')
    expect(badge(wrapper).text()).not.toMatch(/\b0\b/)
  })

  it('uses the factual reason as the badge title, and no title at all when there is none', () => {
    const peak = mountItem(
      BoxGridItem,
      createItem('app', {
        usageStats: { executeCount: 0 },
        recommendation: {
          source: 'time-based',
          badge: BADGE,
          evidence: { peakHourRange: { startHour: 9, endHour: 11 } }
        }
      })
    )
    expect(badge(peak).attributes('title')).toBe(
      message('corebox.evidence.peakHours', { start: '09', end: '11' })
    )

    // A count under "此时常用" cannot stand in for the missing hour pattern (R9).
    const countOnly = mountItem(
      BoxGridItem,
      createItem('app', {
        usageStats: { executeCount: 0 },
        recommendation: { source: 'time-based', badge: BADGE, evidence: { executeCount: 5 } }
      })
    )
    expect(badge(countOnly).attributes('title') ?? '').toBe('')
  })

  it('titles a pinned tile with the pinned fact, since it has no usage evidence to justify', () => {
    const wrapper = mountItem(
      BoxGridItem,
      createItem('app', {
        usageStats: { executeCount: 0 },
        recommendation: { source: 'pinned', badge: PINNED_BADGE }
      })
    )

    // Pinning is a user decision, not dated usage: the title must speak the pin and never fall
    // through to a fabricated reason (R9, AC7).
    expect(badge(wrapper).attributes('title')).toBe(message('coreBox.recommendation.badge.pinned'))
    expect(badge(wrapper).find('[data-corebox-usage-count]').exists()).toBe(false)
  })

  it('refreshes the count and reason together when an execution arrives for the visible tile', async () => {
    const withReason = createItem('app', {
      usageStats: { executeCount: 0 },
      recommendation: {
        source: 'recent',
        badge: BADGE,
        evidence: { lastExecutedAt: Date.now() - 3 * HOUR }
      }
    })
    const wrapper = mountItem(BoxGridItem, withReason)
    expect(badge(wrapper).find('[data-corebox-usage-count]').exists()).toBe(false)
    expect(badge(wrapper).attributes('title')).toBe(
      message('corebox.evidence.lastUsed', {
        age: message('corebox.evidence.age.hours', { count: 3 })
      })
    )

    // The host updates usage in place on the visible tile: the count appears with the new number,
    // and the reason follows the same updated evidence rather than a stale value.
    await wrapper.setProps({
      item: createItem('app', {
        usageStats: { executeCount: 6 },
        recommendation: {
          source: 'recent',
          badge: BADGE,
          evidence: { lastExecutedAt: Date.now() - 60_000 }
        }
      })
    })

    const count = badge(wrapper).find('[data-corebox-usage-count]')
    expect(count.text()).toBe('· 6')
    expect(count.attributes('title')).toBe(message('corebox.usage.launchCount', { count: 6 }))
    expect(badge(wrapper).attributes('title')).toBe(message('corebox.evidence.justUsed'))
  })
})
