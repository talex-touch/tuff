import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, ref } from 'vue'
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { Component, VNode } from 'vue'
import * as tuffexAvatar from '@talex-touch/tuffex/avatar'
import * as tuffexButton from '@talex-touch/tuffex/button'
import * as tuffexDataTable from '@talex-touch/tuffex/data-table'
import * as tuffexEmptyState from '@talex-touch/tuffex/empty-state'
import * as tuffexErrorState from '@talex-touch/tuffex/error-state'
import * as tuffexInput from '@talex-touch/tuffex/input'
import * as tuffexModal from '@talex-touch/tuffex/modal'
import * as tuffexPagination from '@talex-touch/tuffex/pagination'
import * as tuffexSkeleton from '@talex-touch/tuffex/skeleton'
import * as tuffexStatCard from '@talex-touch/tuffex/stat-card'
import * as adminFieldControl from '~/composables/useAdminFieldControl'
import * as adminFormat from '~/composables/useAdminFormat'
import * as adminRouteSkeleton from '~/composables/useAdminRouteSkeleton'
import * as adminKit from '~/utils/admin-kit'
import { loadSfcComponent } from '../../../test/helpers/sfc-component'

/**
 * Markup contracts of the console kit, rendered on the server renderer: which
 * state a table draws, what an identity cell prints, when the confirm button is
 * enabled. Interaction rules (typed confirmation, pager visibility) are pure
 * functions tested in `utils/admin-kit.test.ts`.
 */

const MODULES: Record<string, unknown> = {
  'vue': vue,
  '@talex-touch/tuffex/avatar': tuffexAvatar,
  '@talex-touch/tuffex/button': tuffexButton,
  '@talex-touch/tuffex/data-table': tuffexDataTable,
  '@talex-touch/tuffex/empty-state': tuffexEmptyState,
  '@talex-touch/tuffex/error-state': tuffexErrorState,
  '@talex-touch/tuffex/input': tuffexInput,
  '@talex-touch/tuffex/modal': tuffexModal,
  '@talex-touch/tuffex/pagination': tuffexPagination,
  '@talex-touch/tuffex/skeleton': tuffexSkeleton,
  '@talex-touch/tuffex/stat-card': tuffexStatCard,
  '~/composables/useAdminFieldControl': adminFieldControl,
  '~/composables/useAdminFormat': adminFormat,
  '~/composables/useAdminRouteSkeleton': adminRouteSkeleton,
  '~/utils/admin-kit': adminKit,
}

const components: Record<string, Component> = {}

async function load(name: string): Promise<Component> {
  const component = await loadSfcComponent(`app/components/admin/${name}.vue`, MODULES)
  components[name] = component
  MODULES[`~/components/admin/${name}.vue`] = { default: component }
  return component
}

beforeAll(async () => {
  // English fallbacks stand in for the locale files; interpolations are filled
  // in so a count or a value is visible in the markup.
  vi.stubGlobal('useI18n', () => ({
    locale: ref('en'),
    t: (key: string, second?: unknown) => {
      if (typeof second === 'string')
        return second
      if (second && typeof second === 'object')
        return `${key}:${JSON.stringify(second)}`
      return key
    },
  }))
  await load('AdminSection')
  await load('AdminGateSkeleton')
  await load('AdminPageShell')
  await load('AdminIdentity')
  await load('AdminFilterBar')
  await load('AdminFilterField')
  await load('AdminFormField')
  await load('AdminStatGrid')
  await load('AdminTable')
  await load('AdminConfirmDialog')
})

afterAll(() => {
  vi.unstubAllGlobals()
})

async function render(name: string, props: Record<string, unknown> = {}, slots: Record<string, (scope?: any) => VNode | VNode[] | string> = {}) {
  const context: { teleports?: Record<string, string> } = {}
  const html = await renderToString(createSSRApp({ render: () => h(components[name]!, props, slots) }), context)
  return { html, teleports: Object.values(context.teleports ?? {}).join('') }
}

const ENTITIES: Record<string, string> = { '&quot;': '"', '&#39;': '\'', '&lt;': '<', '&gt;': '>', '&amp;': '&' }

function text(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:quot|#39|lt|gt|amp);/g, entity => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim()
}

const columns = [
  { key: 'name', title: 'Name', width: 120 },
  { key: 'email', title: 'Email' },
]
const rows = [
  { id: 'a', name: 'Ada', email: 'ada@example.test' },
  { id: 'b', name: 'Bo', email: 'bo@example.test' },
]

describe('AdminTable', () => {
  const base = { columns, rowKey: 'id', page: 1, limit: 20, pageSizes: [20, 50, 100] }

  it('draws placeholder rows, not an empty state, before the first response', async () => {
    const { html } = await render('AdminTable', { ...base, rows: [], loading: true, total: 0 })
    expect(html).toContain('tx-data-table__row--skeleton')
    expect(html.match(/tx-data-table__row--skeleton/g)?.length).toBe(20)
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('tx-empty-state')
    expect(html).not.toContain('AdminTable-Footer')
  })

  it('keeps the rows during a refresh instead of going back to the skeleton', async () => {
    const { html } = await render('AdminTable', { ...base, rows, total: 2, refreshing: true })
    expect(html).not.toContain('tx-data-table__row--skeleton')
    expect(text(html)).toContain('Ada')
    expect(text(html)).toContain('bo@example.test')
  })

  it('replaces the body with the error and a retry, never with an empty state', async () => {
    const { html } = await render('AdminTable', { ...base, rows, total: 2, error: 'Audit store unavailable.' })
    expect(text(html)).toContain('Audit store unavailable.')
    expect(text(html)).toContain('Retry')
    expect(text(html)).not.toContain('Ada')
    expect(html).not.toContain('AdminTable-Footer')
  })

  it('tells "nothing yet" apart from "nothing matches the filters"', async () => {
    const empty = await render('AdminTable', { ...base, rows: [], total: 0, emptyTitle: 'No audit records found.' })
    expect(text(empty.html)).toContain('No audit records found.')
    expect(text(empty.html)).not.toContain('Clear filters')

    const filtered = await render('AdminTable', {
      ...base,
      rows: [],
      total: 0,
      filtered: true,
      emptyTitle: 'No audit records found.',
      filteredEmptyTitle: 'No audit records match these filters.',
    })
    expect(text(filtered.html)).toContain('No audit records match these filters.')
    expect(text(filtered.html)).toContain('Clear filters')
    expect(text(filtered.html)).not.toContain('No audit records found.')
  })

  it('shows the total with the pager once there is more than one page', async () => {
    const { html } = await render('AdminTable', { ...base, rows, total: 61 })
    expect(html).toContain('AdminTable-Footer')
    expect(text(html)).toContain('dashboard.sections.adminKit.table.total:{"count":"61"}')
    expect(html).toContain('tx-pagination')
    expect(html).toContain('has-page-size')
  })

  it('shows the count alone for a result that fits on one page', async () => {
    const { html } = await render('AdminTable', { ...base, rows, total: 2 })
    expect(text(html)).toContain('dashboard.sections.adminKit.table.total:{"count":"2"}')
    expect(html).not.toContain('tx-pagination')
  })

  it('makes rows focusable only when they open something', async () => {
    // `TxDataTable` turns a row into a tab stop that Enter and Space activate as
    // soon as a `rowClick` listener exists, so the listener is only attached for
    // `clickableRows` (the user and audit tables open a detail drawer).
    const clickable = await render('AdminTable', { ...base, rows, total: 2, clickableRows: true })
    const rowTags = clickable.html.match(/<tr class="tx-data-table__row[^"]*"[^>]*>/g) ?? []
    expect(rowTags).toHaveLength(2)
    for (const tag of rowTags) {
      expect(tag).toContain('is-interactive')
      expect(tag).toContain('tabindex="0"')
    }

    const plain = await render('AdminTable', { ...base, rows, total: 2 })
    const plainTags = plain.html.match(/<tr class="tx-data-table__row[^"]*"[^>]*>/g) ?? []
    expect(plainTags).toHaveLength(2)
    for (const tag of plainTags) {
      expect(tag).not.toContain('is-interactive')
      expect(tag).not.toContain('tabindex')
    }
  })

  it('forwards cell slots to the table', async () => {
    const { html } = await render('AdminTable', { ...base, rows, total: 2 }, {
      'cell-name': ({ row }: { row: { name: string } }) => h('strong', { class: 'probe' }, row.name.toUpperCase()),
    })
    expect(html).toContain('<strong class="probe">ADA</strong>')
  })
})

describe('AdminIdentity', () => {
  it('prints an email once when there is no name', async () => {
    const { html } = await render('AdminIdentity', { name: null, email: 'ui-audit-bot@local.test' })
    expect(text(html).match(/ui-audit-bot@local\.test/g)).toHaveLength(1)
  })

  it('puts the email under a name, and keeps compact cells to one line', async () => {
    const full = await render('AdminIdentity', { name: 'Ada', email: 'ada@example.test' })
    expect(full.html).toContain('AdminIdentity-Secondary')
    expect(text(full.html)).toContain('ada@example.test')

    const compact = await render('AdminIdentity', { name: 'Ada', email: 'ada@example.test', compact: true })
    expect(compact.html).not.toContain('AdminIdentity-Secondary')
    expect(compact.html).toContain('title="Ada · ada@example.test"')
  })

  it('takes the avatar initial past brackets', async () => {
    const { html } = await render('AdminIdentity', { name: '[Robot] Builder', email: null })
    expect(html).toMatch(/tx-avatar__text[^>]*>\s*R\s*</)
  })
})

describe('AdminConfirmDialog', () => {
  it('locks the confirm button until the required text is typed', async () => {
    const { teleports } = await render('AdminConfirmDialog', {
      open: true,
      title: 'Delete record',
      description: 'This cannot be undone.',
      requireText: 'DELETE',
    })
    expect(text(teleports)).toContain('dashboard.sections.adminKit.confirm.requireText:{"text":"DELETE"}')
    const confirm = teleports.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Confirm(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0] ?? ''
    expect(confirm).toContain('disabled')
  })

  it('disables both buttons while the action runs', async () => {
    const { teleports } = await render('AdminConfirmDialog', { open: true, title: 'Revoke', loading: true })
    const buttons = [...teleports.matchAll(/<button[^>]*class="[^"]*tx-button[^"]*"[^>]*>/g)].map(match => match[0])
    expect(buttons).toHaveLength(2)
    for (const button of buttons)
      expect(button).toContain('disabled')
  })

  it('leaves the confirm button enabled when no text is required', async () => {
    const { teleports } = await render('AdminConfirmDialog', { open: true, title: 'Revoke', tone: 'warning' })
    const buttons = [...teleports.matchAll(/<button[^>]*class="[^"]*tx-button[^"]*"[^>]*>/g)].map(match => match[0])
    expect(buttons).toHaveLength(2)
    expect(buttons[1]).not.toContain('disabled')
  })

  it('cannot be closed by Escape, the backdrop or the close button while the action runs', async () => {
    // TxModal routes all three through `update:modelValue`; a stub captures that
    // handler so the test can press them.
    let closeModal: ((open: boolean) => void) | undefined
    const ModalStub = defineComponent({
      props: ['modelValue', 'title', 'width', 'onUpdate:modelValue'],
      setup(props, { slots }) {
        closeModal = props['onUpdate:modelValue'] as (open: boolean) => void
        return () => h('div', [slots.default?.(), slots.footer?.()])
      },
    })
    const Dialog = await loadSfcComponent('app/components/admin/AdminConfirmDialog.vue', {
      ...MODULES,
      '@talex-touch/tuffex/modal': { TxModal: ModalStub },
    })

    const onUpdateOpen = vi.fn()
    async function renderDialog(loading: boolean) {
      await renderToString(createSSRApp({
        render: () => h(Dialog, { 'open': true, 'title': 'Revoke', loading, 'onUpdate:open': onUpdateOpen }),
      }))
    }

    await renderDialog(true)
    closeModal?.(false)
    expect(onUpdateOpen).not.toHaveBeenCalled()

    await renderDialog(false)
    closeModal?.(false)
    expect(onUpdateOpen).toHaveBeenCalledWith(false)
  })
})

describe('AdminFilterBar and AdminFilterField', () => {
  it('keeps "Clear filters" disabled until a filter is in effect', async () => {
    const idle = await render('AdminFilterBar', { active: false })
    expect(idle.html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*Clear filters/)

    const active = await render('AdminFilterBar', { active: true })
    expect(active.html).not.toMatch(/<button[^>]*disabled[^>]*>[\s\S]*Clear filters/)
  })

  it('labels a control with `for`, and never wraps the control in the label', async () => {
    const { html } = await render('AdminFilterField', { label: 'Search', for: 'probe-input' }, {
      default: () => h('input', { id: 'probe-input' }),
    })
    expect(html).toMatch(/<label[^>]*for="probe-input"[^>]*>Search<\/label>/)
    expect(html).not.toMatch(/<label[^>]*>[^<]*<input/)
  })
})

describe('AdminFormField', () => {
  it('is a block field: label, control, then the hint, never a filter-row flex item', async () => {
    const { html } = await render('AdminFormField', { label: 'Duration (days)', for: 'probe-days', hint: 'A whole number from 1 to 365' }, {
      default: () => h('input', { id: 'probe-days' }),
    })
    expect(html).toMatch(/^<div class="AdminFormField"/)
    expect(html).not.toContain('AdminFilterField')
    expect(html).toMatch(/<label[^>]*for="probe-days"[^>]*>Duration \(days\)<\/label>/)
    expect(html).not.toMatch(/<label[^>]*>[^<]*<input/)
    const label = html.indexOf('AdminFormField-Label')
    const control = html.indexOf('id="probe-days"')
    const hint = html.indexOf('AdminFormField-Hint')
    expect(label).toBeGreaterThan(-1)
    expect(control).toBeGreaterThan(label)
    expect(hint).toBeGreaterThan(control)
    expect(text(html)).toContain('A whole number from 1 to 365')
  })

  it('gives the hint an id the control can be described by, and none without a hint', async () => {
    let scope: { labelId?: string, hintId?: string | null } = {}
    const withHint = await render('AdminFormField', { label: 'Count', hint: 'From 1 to 100' }, {
      default: (slot: typeof scope) => {
        scope = slot
        return h('input')
      },
    })
    expect(scope.hintId).toBeTruthy()
    expect(withHint.html).toContain(`<p id="${scope.hintId}" class="AdminFormField-Hint"`)
    expect(withHint.html).toMatch(new RegExp(`<span id="${scope.labelId}" class="AdminFormField-Label"`))

    const without = await render('AdminFormField', { label: 'Count' }, {
      default: (slot: typeof scope) => {
        scope = slot
        return h('input')
      },
    })
    expect(scope.hintId).toBeNull()
    expect(without.html).not.toContain('AdminFormField-Hint')
  })

  it('labels without `for` through a plain-text label, and marks the field invalid', async () => {
    const { html } = await render('AdminFormField', { label: 'Plan', hint: 'Pick a plan', invalid: true }, {
      default: () => h('div', { role: 'combobox' }),
    })
    expect(html).toMatch(/<span id="[^"]+" class="AdminFormField-Label"[^>]*>Plan<\/span>/)
    expect(html).not.toContain('<label')
    expect(html).toMatch(/^<div class="AdminFormField is-invalid"/)
  })
})

describe('AdminStatGrid, AdminSection and AdminPageShell', () => {
  it('draws one placeholder per card while loading', async () => {
    const items = [
      { key: 'a', label: 'Users', value: 12 },
      { key: 'b', label: 'Admins', value: 2 },
      { key: 'c', label: 'Codes', value: 40 },
    ]
    const loading = await render('AdminStatGrid', { items, loading: true })
    expect(loading.html.match(/AdminStatGrid-Placeholder/g)).toHaveLength(3)
    expect(loading.html).not.toContain('tx-stat-card')

    const loaded = await render('AdminStatGrid', { items })
    expect(loaded.html.match(/class="tx-stat-card fake-background/g)).toHaveLength(3)
  })

  it('titles a section with an h2 that names the block', async () => {
    const { html } = await render('AdminSection', { title: 'Retention', description: 'Rows older than 90 days.' }, {
      default: () => 'body',
    })
    expect(html).toMatch(/<h2[^>]*class="AdminSection-Title"[^>]*>\s*Retention\s*<\/h2>/)
    expect(html).toMatch(/aria-labelledby="[^"]+"/)
  })

  it('places the #nav strip between the heading and the filters', async () => {
    const { html } = await render('AdminPageShell', { title: 'Analytics' }, {
      nav: () => h('nav', { class: 'probe-nav' }),
      filters: () => h('div', { class: 'probe-filters' }),
      default: () => h('div', { class: 'probe-body' }),
    })
    const heading = html.indexOf('AdminPageShell-Title')
    const nav = html.indexOf('probe-nav')
    const filters = html.indexOf('probe-filters')
    expect(heading).toBeGreaterThan(-1)
    expect(nav).toBeGreaterThan(heading)
    expect(filters).toBeGreaterThan(nav)
    expect(html.match(/<h1/g)).toHaveLength(1)
  })

  it('draws the gate skeleton as decoration only', async () => {
    const { html } = await render('AdminGateSkeleton')
    expect(html).toMatch(/^<div class="AdminGateSkeleton" aria-hidden="true"/)
    expect(html.match(/<section class="AdminSection/g)).toHaveLength(2)
  })
})
