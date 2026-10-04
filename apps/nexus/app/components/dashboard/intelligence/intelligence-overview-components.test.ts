import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, ref } from 'vue'
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { Component } from 'vue'
import * as tuffexButton from '@talex-touch/tuffex/button'
import * as tuffexEmptyState from '@talex-touch/tuffex/empty-state'
import * as tuffexErrorState from '@talex-touch/tuffex/error-state'
import * as tuffexInput from '@talex-touch/tuffex/input'
import * as tuffexSkeleton from '@talex-touch/tuffex/skeleton'
import * as tuffexStatCard from '@talex-touch/tuffex/stat-card'
import * as adminFieldControl from '~/composables/useAdminFieldControl'
import * as adminFormat from '~/composables/useAdminFormat'
import * as adminResource from '~/composables/useAdminResource'
import * as adminIntelligence from '~/utils/admin-intelligence'
import * as adminKit from '~/utils/admin-kit'
import { loadSfcComponent } from '../../../../test/helpers/sfc-component'

/**
 * Markup of the AI overview's own components, on the server renderer: what a
 * ranked list draws while loading, empty and filled, and how the user lookup's
 * field is labelled and when it can be sent. The rules behind them are tested in
 * `pages/admin/intelligence-overview-page-behavior.test.ts`.
 */

const request = vi.fn()

const MODULES: Record<string, unknown> = {
  'vue': vue,
  '@talex-touch/tuffex/button': tuffexButton,
  '@talex-touch/tuffex/empty-state': tuffexEmptyState,
  '@talex-touch/tuffex/error-state': tuffexErrorState,
  '@talex-touch/tuffex/input': tuffexInput,
  '@talex-touch/tuffex/skeleton': tuffexSkeleton,
  '@talex-touch/tuffex/stat-card': tuffexStatCard,
  '~/composables/useAdminFieldControl': adminFieldControl,
  '~/composables/useAdminFormat': adminFormat,
  '~/composables/useAdminResource': adminResource,
  '~/utils/admin-intelligence': adminIntelligence,
  '~/utils/admin-kit': adminKit,
  '~/utils/request': { requestJson: request },
}

const components: Record<string, Component> = {}

async function load(path: string, specifier: string) {
  const component = await loadSfcComponent(path, MODULES)
  MODULES[specifier] = { default: component }
  return component
}

beforeAll(async () => {
  // English fallbacks stand in for the locale files.
  vi.stubGlobal('useI18n', () => ({
    locale: ref('en'),
    t: (key: string, second?: unknown) => (typeof second === 'string' ? second : key),
  }))
  await load('app/components/admin/AdminSection.vue', '~/components/admin/AdminSection.vue')
  await load('app/components/admin/AdminFormField.vue', '~/components/admin/AdminFormField.vue')
  await load('app/components/admin/AdminStatGrid.vue', '~/components/admin/AdminStatGrid.vue')
  components.IntelligenceTopList = await load(
    'app/components/dashboard/intelligence/IntelligenceTopList.vue',
    '~/components/dashboard/intelligence/IntelligenceTopList.vue',
  )
  components.IntelligenceUsageLookup = await load(
    'app/components/dashboard/intelligence/IntelligenceUsageLookup.vue',
    '~/components/dashboard/intelligence/IntelligenceUsageLookup.vue',
  )
})

afterAll(() => {
  vi.unstubAllGlobals()
})

async function render(name: string, props: Record<string, unknown> = {}) {
  return renderToString(createSSRApp({ render: () => h(components[name]!, props) }))
}

describe('IntelligenceTopList', () => {
  const rows = [
    { key: '0:gpt-4o-mini', label: 'gpt-4o-mini', count: '1,200' },
    { key: '1:deepseek-chat', label: 'deepseek-chat', count: '34' },
  ]

  it('draws one placeholder row per row the list can hold while loading', async () => {
    const html = await render('IntelligenceTopList', { rows: [], loading: true, skeletonRows: 6, emptyText: 'No data' })
    expect(html).toMatch(/^<ol class="IntelligenceTopList" aria-hidden="true">/)
    expect(html.match(/<li class="IntelligenceTopList-Row">/g)).toHaveLength(6)
    expect(html).toContain('tx-skeleton')
    // A first load never says "no data".
    expect(html).not.toContain('No data')
    expect(html).not.toContain('tx-empty-state')
  })

  it('says "no data" for an empty list, in the empty state rather than as an error', async () => {
    const html = await render('IntelligenceTopList', { rows: [], emptyText: 'No data' })
    expect(html).toContain('tx-empty-state')
    expect(html).toContain('No data')
    expect(html).not.toContain('<ol')
    expect(html).not.toContain('error')
  })

  it('prints each name, cut to one line with the full name as its title, and its count', async () => {
    const html = await render('IntelligenceTopList', { rows, emptyText: 'No data' })
    expect(html.match(/<li class="IntelligenceTopList-Row">/g)).toHaveLength(2)
    expect(html).toContain('<span class="IntelligenceTopList-Label" title="gpt-4o-mini">gpt-4o-mini</span>')
    expect(html).toContain('<span class="IntelligenceTopList-Count">1,200</span>')
    expect(html).not.toContain('aria-hidden')
  })
})

describe('IntelligenceUsageLookup', () => {
  it('labels the user id field through for/id, and cannot be sent while it is empty', async () => {
    const html = await render('IntelligenceUsageLookup')

    const label = html.match(/<label[^>]*\sfor="([^"]+)"[^>]*>User ID<\/label>/)
    expect(label, 'a visible "User ID" label with a for').toBeTruthy()
    expect(html).toMatch(new RegExp(`<input[^>]*\\sid="${label![1]}"`))

    // One form: Enter in the field and the button send the same submit.
    expect(html.match(/<form/g)).toHaveLength(1)
    const button = html.match(/<button[^>]*type="submit"[^>]*>/)
    expect(button, 'the Query button submits the form').toBeTruthy()
    expect(button![0]).toMatch(/\sdisabled/)
  })

  it('asks for nothing and shows no result before the first query', async () => {
    request.mockClear()
    const html = await render('IntelligenceUsageLookup')
    expect(request).not.toHaveBeenCalled()
    expect(html).not.toContain('UsageLookup-Result')
  })
})
