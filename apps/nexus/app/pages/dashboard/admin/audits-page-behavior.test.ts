import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'
import {
  computed,
  createRenderer,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'vue'

/**
 * Compiles the audits page `<script setup>` the same way
 * analytics-page-performance.test.ts does, so the filter/pagination/error
 * behaviour is exercised as shipped rather than re-implemented here.
 */

interface AuditsRequest {
  (path: string, options?: Record<string, unknown>): Promise<unknown>
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface AuditsFacade {
  audits: Ref<unknown[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  pagination: Pagination
  filters: { q: string, action: string }
  hasPrev: Ref<boolean>
  hasNext: Ref<boolean>
  actionLabels: Ref<Record<string, string>>
  actionOptions: Ref<Array<{ value: string, label: string }>>
  fetchAudits: (options?: { resetPage?: boolean }) => Promise<void>
  goPrev: () => Promise<void>
  goNext: () => Promise<void>
  formatDetail: (entry: Record<string, unknown>) => string
}

interface HostNode extends Record<string, never> {}

const renderer = createRenderer<HostNode, HostNode>({
  patchProp: () => undefined,
  insert: () => undefined,
  remove: () => undefined,
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText: () => undefined,
  setElementText: () => undefined,
  parentNode: () => null,
  nextSibling: () => null,
  querySelector: () => null,
  setScopeId: () => undefined,
  cloneNode: node => node,
  insertStaticContent: () => [{}, {}],
})

const source = readFileSync(new URL('./audits.vue', import.meta.url), 'utf8')
const scriptSetup = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]

if (!scriptSetup)
  throw new Error('Expected audits page script setup.')

const scriptWithoutImports = scriptSetup.replace(/^import[\s\S]*?from [^\n]+\n/gm, '')

interface SetupDependencies {
  locale: Ref<string>
  requestJson: AuditsRequest
  role?: string | null
}

let setupFacade: (dependencies: SetupDependencies) => AuditsFacade

beforeAll(async () => {
  const executable = `
export function setupAuditsFacade(dependencies) {
  const { ref, reactive, computed, watch, onMounted, onBeforeUnmount } = dependencies.vue
  const { definePageMeta, defineI18nRoute, useI18n, useAuthUser, navigateTo, requestJson, hasWindow } = dependencies.nuxt
${scriptWithoutImports}
  return {
    audits, loading, error, pagination, filters, hasPrev, hasNext,
    actionLabels, actionOptions, fetchAudits, goPrev, goNext, formatDetail,
  }
}
`
  const { code } = await transform(executable, { format: 'esm', loader: 'ts', target: 'esnext' })
  // The SFC is compiled in-memory, so there is no static specifier to import.
  const compiled: any = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

  setupFacade = dependencies => compiled.setupAuditsFacade({
    vue: { ref, reactive, computed, watch, onMounted, onBeforeUnmount },
    nuxt: {
      definePageMeta: () => undefined,
      defineI18nRoute: () => undefined,
      // Mirrors vue-i18n: a real locale wins, and the inline fallback is only
      // used when the key is absent. Reading `locale` makes t() reactive.
      useI18n: () => ({
        t: (key: string, fallback: string) =>
          dependencies.locale.value === 'zh' ? `zh:${key}` : fallback,
        locale: dependencies.locale,
      }),
      useAuthUser: () => ({ user: ref({ role: dependencies.role ?? 'admin' }) }),
      navigateTo: vi.fn(),
      requestJson: dependencies.requestJson,
      hasWindow: () => false,
    },
  })
})

function auditPage(overrides: Partial<Pagination> = {}, rows = 1) {
  return {
    audits: Array.from({ length: rows }, (_, i) => ({ id: `a${i}`, action: 'user.role.update' })),
    pagination: { page: 1, limit: 20, total: 61, totalPages: 4, ...overrides },
  }
}

async function settle() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function mountAuditsPage(options: Partial<SetupDependencies> = {}) {
  let facade: AuditsFacade | undefined
  const locale = options.locale ?? ref('en')
  const requestJson = options.requestJson ?? vi.fn(async () => auditPage())
  const PageHost = defineComponent({
    setup() {
      facade = setupFacade({ locale, requestJson, role: options.role })
      return () => null
    },
  })
  const app = renderer.createApp(PageHost)
  app.mount({})
  await settle()
  if (!facade)
    throw new Error('Expected audits facade to initialize.')
  return { app, facade, locale, requestJson }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('dashboard admin audits facade', () => {
  it('shows the localized failure message instead of the transport\'s internal error string', async () => {
    // ofetch rejects with '[GET] "/api/admin/audits?page=1": <no response> Failed
    // to fetch' on err.message. Surfacing that leaked the API path to admins and
    // meant the localized fallback was never reached.
    const requestJson = vi.fn(async () => {
      throw Object.assign(new Error('[GET] "/api/admin/audits?page=1&limit=20": <no response> Failed to fetch'), {})
    })
    const page = await mountAuditsPage({ requestJson })

    expect(page.facade.error.value).toBe('Failed to load audit logs.')
    expect(page.facade.error.value).not.toMatch(/\/api\/admin\/audits/)

    page.app.unmount()
  })

  it('prefers a server-supplied message when the API explains itself', async () => {
    const requestJson = vi.fn(async () => {
      throw Object.assign(new Error('ignored transport text'), { data: { message: 'Audit store unavailable.' } })
    })
    const page = await mountAuditsPage({ requestJson })

    expect(page.facade.error.value).toBe('Audit store unavailable.')

    page.app.unmount()
  })

  it('drops the previous rows on failure so a stale page is never captioned by a fresh error', async () => {
    let shouldFail = false
    const requestJson = vi.fn(async () => {
      if (shouldFail)
        throw new Error('boom')
      return auditPage({}, 3)
    })
    const page = await mountAuditsPage({ requestJson })
    expect(page.facade.audits.value).toHaveLength(3)

    shouldFail = true
    await page.facade.fetchAudits()

    expect(page.facade.error.value).toBe('Failed to load audit logs.')
    expect(page.facade.audits.value).toEqual([])

    page.app.unmount()
  })

  it('retranslates the action column when the locale changes', async () => {
    // actionLabels used to be a plain object built once during setup, so the
    // filter dropdown followed a locale switch and the table column did not.
    const locale = ref('en')
    const page = await mountAuditsPage({ locale })

    expect(page.facade.actionLabels.value['user.role.update']).toBe('User role updated')

    locale.value = 'zh'
    await nextTick()

    expect(page.facade.actionLabels.value['user.role.update'])
      .toBe('zh:dashboard.sections.audits.actions.userRole')

    page.app.unmount()
  })

  it('derives the filter options from the label map so the two cannot drift apart', async () => {
    const page = await mountAuditsPage()
    const optionValues = page.facade.actionOptions.value.map(option => option.value)

    expect(optionValues[0]).toBe('all')
    expect(optionValues.slice(1)).toEqual(Object.keys(page.facade.actionLabels.value))
    for (const option of page.facade.actionOptions.value.slice(1))
      expect(option.label).toBe(page.facade.actionLabels.value[option.value])

    page.app.unmount()
  })

  it('disables paging past either end of the result set', async () => {
    const page = await mountAuditsPage({
      requestJson: vi.fn(async (_path, options: any) => auditPage({ page: options.query.page })),
    })

    expect(page.facade.pagination.totalPages).toBe(4)
    expect(page.facade.hasPrev.value).toBe(false)
    expect(page.facade.hasNext.value).toBe(true)

    await page.facade.goNext()
    await page.facade.goNext()
    await page.facade.goNext()

    expect(page.facade.pagination.page).toBe(4)
    expect(page.facade.hasNext.value).toBe(false)
    expect(page.facade.hasPrev.value).toBe(true)

    // A click on the disabled control must not walk off the end.
    await page.facade.goNext()
    expect(page.facade.pagination.page).toBe(4)

    page.app.unmount()
  })

  it('returns to the first page when a filter narrows the result set', async () => {
    vi.useFakeTimers()
    const requestJson = vi.fn(async (_path: string, options: any) => auditPage({ page: options.query.page }))
    const page = await mountAuditsPage({ requestJson })

    await page.facade.goNext()
    expect(page.facade.pagination.page).toBe(2)

    page.facade.filters.action = 'audit.export'
    await settle()

    expect(page.facade.pagination.page).toBe(1)
    const lastCall = requestJson.mock.calls.at(-1)?.[1] as any
    expect(lastCall.query).toMatchObject({ page: 1, action: 'audit.export' })

    page.app.unmount()
  })

  it('omits blank filters from the query rather than sending empty values', async () => {
    // Params are declared so the recorded call tuple has an index 1 to read;
    // a zero-arg factory types `mock.calls[0]` as `[]`.
    const requestJson = vi.fn(async (_path: string, _options?: unknown) => auditPage())
    const page = await mountAuditsPage({ requestJson })

    const query = (requestJson.mock.calls[0]?.[1] as any).query
    expect(query).toEqual({ page: 1, limit: 20 })

    page.app.unmount()
  })
})
