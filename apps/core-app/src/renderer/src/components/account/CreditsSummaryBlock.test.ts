// @vitest-environment jsdom
import type * as VueModule from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CreditsSummaryBlock from './CreditsSummaryBlock.vue'

/**
 * The block shows the balance alone. The published rate card moved to the Nexus dashboard, so
 * no capability name and no price may be rendered here again.
 *
 * The mocked composable still carries the retired `pricing` list on purpose: a component that
 * starts reading it — the regression this test exists to catch — renders its capability names
 * and rates, and every absence assertion below fails.
 */
const creditsMock = vi.hoisted(() => {
  const { computed, ref } = require('vue') as typeof VueModule

  const balance = ref({ quota: 900, used: 120, remaining: 780 })

  return {
    pricing: computed(() => [
      {
        capability: 'vision.ocr',
        unit: 'image',
        creditsPerUnit: 2000,
        secondaryUnit: null,
        secondaryCreditsPerUnit: null,
        minCredits: 1
      },
      {
        capability: 'image.translate.e2e',
        unit: 'image',
        creditsPerUnit: 3000,
        secondaryUnit: null,
        secondaryCreditsPerUnit: null,
        minCredits: 1
      }
    ]),
    state: {
      isLoggedIn: computed(() => true),
      loading: computed(() => false),
      error: computed(() => ''),
      summary: computed(() => ({
        month: '2026-09',
        user: balance.value,
        team: { quota: 0, used: 0, remaining: 0 },
        teamContext: null
      })),
      personalRemaining: computed(() => balance.value.remaining),
      personalUsed: computed(() => balance.value.used),
      personalQuota: computed(() => balance.value.quota),
      hasTeamPool: computed(() => false),
      teamRemaining: computed(() => 0),
      teamUsed: computed(() => 0),
      teamQuota: computed(() => 0),
      refresh: async () => {},
      openCreditsDashboard: () => {}
    }
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key)
  })
}))

vi.mock('~/modules/nexus/credits-summary', () => ({
  useCreditsSummary: () => ({ ...creditsMock.state, pricing: creditsMock.pricing })
}))

const stubs = {
  TuffGroupBlock: {
    template: '<section><slot /></section>',
    props: ['name', 'description']
  },
  TuffBlockSlot: {
    template:
      '<article><strong>{{ title }}</strong><small>{{ description }}</small><slot /></article>',
    props: ['title', 'description']
  },
  TxButton: {
    template: '<button type="button"><slot /></button>'
  }
}

let mounted: Array<{ unmount: () => void }> = []

afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount()
  mounted = []
})

describe('credits summary block', () => {
  it('renders the remaining, used and granted balance and no capability or price', () => {
    const wrapper = mount(CreditsSummaryBlock, { global: { stubs } })
    mounted.push(wrapper)

    const text = wrapper.text()
    // Built with the platform formatter, so the assertion does not depend on the runtime locale.
    const amount = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
    expect(text).toContain(amount.format(780))
    expect(text).toContain(amount.format(120))
    expect(text).toContain(amount.format(900))

    expect(text).not.toContain('vision.ocr')
    expect(text).not.toContain('image.translate.e2e')
    expect(text).not.toContain('2000')
    expect(text).not.toContain('3000')
  })
})
