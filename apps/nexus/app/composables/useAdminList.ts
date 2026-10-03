import { computed, getCurrentInstance, onMounted, onScopeDispose, reactive, ref, shallowRef, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'

/** Filter values are strings: they round-trip through the URL as they are. */
export type AdminListFilters = Record<string, string>

export interface AdminListFetchParams<F extends AdminListFilters> {
  page: number
  limit: number
  /** The applied filters: text filters trimmed, every key present (defaults included). */
  filters: F
}

export interface AdminListPage<Row> {
  rows: Row[]
  total: number
}

export interface AdminListOptions<Row, F extends AdminListFilters> {
  fetch: (params: AdminListFetchParams<F>) => Promise<AdminListPage<Row>>
  /** Every filter key with its default. A filter at its default is neither written to the URL nor counted as active. */
  defaults: F
  /** @default 20 */
  defaultLimit?: number
  /** Page sizes offered to the reader; a `?limit=` outside them falls back to `defaultLimit`. @default [20, 50, 100] */
  pageSizes?: number[]
  /** Text filters: trimmed, and applied 300 ms after the last keystroke instead of on every one. */
  debounceKeys?: Array<keyof F & string>
  /** Read and write the state through the route query. @default true */
  query?: boolean
  /**
   * Prepended to every query key this list owns: `p_` makes them `?p_page=`,
   * `?p_limit=` and `?p_<filter>=`. For two lists on one route (the comment
   * queues), which would otherwise read and overwrite each other's page and
   * filters. The `filters` handed to `fetch` keep their own, unprefixed names.
   * @default ''
   */
  queryKeyPrefix?: string
  /** Shown when a request fails and the server gave no message of its own. Defaults to a generic localized line. */
  errorFallback?: MaybeRefOrGetter<string>
}

export interface AdminListState<Row, F extends AdminListFilters> {
  rows: Readonly<Ref<Row[]>>
  total: Readonly<Ref<number>>
  page: Readonly<Ref<number>>
  limit: Readonly<Ref<number>>
  pageSizes: number[]
  /** Live filter values: bind inputs to these. */
  filters: F
  /** The filters the rows on screen were fetched with (export links and the like read these). */
  appliedFilters: ComputedRef<Readonly<F>>
  /** A request is running and there are no rows to keep on screen: draw the skeleton. True before the first request is sent. */
  loading: Readonly<Ref<boolean>>
  /** A request is running and the current rows stay on screen. */
  refreshing: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  hasActiveFilters: ComputedRef<boolean>
  refresh: () => Promise<void>
  clearFilters: () => void
  setPage: (page: number) => void
  setLimit: (limit: number) => void
}

interface AppliedState<F extends AdminListFilters> {
  page: number
  limit: number
  filters: F
}

type QueryValue = string | null | Array<string | null> | undefined

const TEXT_FILTER_DEBOUNCE_MS = 300
const DEFAULT_PAGE_SIZES = [20, 50, 100]

function firstQueryValue(value: QueryValue): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : undefined
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim()))
    return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function sameQuery(left: Record<string, QueryValue>, right: Record<string, QueryValue>): boolean {
  const serialize = (query: Record<string, QueryValue>) => JSON.stringify(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  )
  return serialize(left) === serialize(right)
}

/**
 * Page, page size, filters and rows of one administrator list.
 *
 * - The state lives in the URL query (`?q=&action=&page=&limit=`), so a filtered
 *   page can be reloaded, bookmarked or shared; only non-default values are
 *   written, and keys this list does not own (`?tab=`) are kept. Two lists on one
 *   route each take a `queryKeyPrefix` (`?p_page=` / `?d_page=`).
 * - A filter or page-size change goes back to page 1. Text filters wait 300 ms.
 * - Every request carries a generation; a response that arrives after a newer
 *   request started is dropped, so a slow first page cannot overwrite a fast second.
 * - `loading` is true from the start until the first response, so a list never
 *   shows "no data" before it has asked. A refresh keeps the rows (`refreshing`).
 * - A failure clears the rows and reports a presentable message, never the
 *   transport's `[GET] "/api/…"` text.
 * - Nothing is requested on the server: the first request goes out on mount.
 */
export function useAdminList<Row, F extends AdminListFilters>(options: AdminListOptions<Row, F>): AdminListState<Row, F> {
  const syncQuery = options.query !== false
  const route = syncQuery ? useRoute() : null
  const router = syncQuery ? useRouter() : null
  const ownPath = route?.path
  const i18n = options.errorFallback === undefined ? useI18n() : null

  const pageSizes = [...new Set((options.pageSizes ?? DEFAULT_PAGE_SIZES).filter(size => Number.isInteger(size) && size > 0))]
    .sort((a, b) => a - b)
  const requestedLimit = options.defaultLimit ?? 20
  const defaultLimit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 20
  const filterKeys = Object.keys(options.defaults) as Array<keyof F & string>
  const debouncedKeys = new Set<string>(options.debounceKeys ?? [])
  const keyPrefix = options.queryKeyPrefix ?? ''
  const queryKey = (name: string) => `${keyPrefix}${name}`
  const managedKeys = new Set<string>([queryKey('page'), queryKey('limit'), ...filterKeys.map(queryKey)])

  function normalizeFilters(source: Record<string, unknown>): F {
    const normalized = { ...options.defaults } as Record<string, string>
    for (const key of filterKeys) {
      const value = source[key]
      if (typeof value === 'string')
        normalized[key] = debouncedKeys.has(key) ? value.trim() : value
    }
    return normalized as F
  }

  function sameFilters(left: F, right: F): boolean {
    return filterKeys.every(key => left[key] === right[key])
  }

  function readQuery(): AppliedState<F> {
    const query = (route?.query ?? {}) as Record<string, QueryValue>
    const limit = parsePositiveInteger(firstQueryValue(query[queryKey('limit')]))
    const filters: Record<string, unknown> = {}
    for (const key of filterKeys)
      filters[key] = firstQueryValue(query[queryKey(key)])
    return {
      page: parsePositiveInteger(firstQueryValue(query[queryKey('page')])) ?? 1,
      limit: limit !== null && pageSizes.includes(limit) ? limit : defaultLimit,
      filters: normalizeFilters(filters),
    }
  }

  function writeQuery(state: AppliedState<F>) {
    if (!route || !router || route.path !== ownPath)
      return
    const current = route.query as Record<string, QueryValue>
    const query: Record<string, QueryValue> = {}
    for (const [name, value] of Object.entries(current)) {
      if (!managedKeys.has(name))
        query[name] = value
    }
    for (const key of filterKeys) {
      if (state.filters[key] !== options.defaults[key])
        query[queryKey(key)] = state.filters[key]
    }
    if (state.page !== 1)
      query[queryKey('page')] = String(state.page)
    if (state.limit !== defaultLimit)
      query[queryKey('limit')] = String(state.limit)
    if (sameQuery(query, current))
      return
    void router.replace({ path: route.path, query, hash: route.hash })
  }

  const applied = shallowRef<AppliedState<F>>(readQuery())
  const filters = reactive({ ...applied.value.filters }) as F
  const rows = shallowRef<Row[]>([])
  const total = ref(0)
  // Starts true: between setup and the first response there is nothing to show
  // but a skeleton, and a list that briefly says "no data" before it has even
  // asked is the flash this exists to prevent.
  const pending = ref(true)
  const error = ref<string | null>(null)
  let loadedOnce = false
  let generation = 0
  let disposed = false
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let lastLoad: Promise<void> = Promise.resolve()

  function errorFallback(): string {
    const configured = toValue(options.errorFallback)
    if (configured)
      return configured
    return i18n?.t('dashboard.sections.adminKit.list.loadFailed', 'Failed to load data.') ?? 'Failed to load data.'
  }

  function cancelDebounce() {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }
  }

  async function runLoad(): Promise<void> {
    const request = ++generation
    pending.value = true
    error.value = null
    const state = applied.value
    try {
      const result = await options.fetch({ page: state.page, limit: state.limit, filters: { ...state.filters } })
      if (request !== generation)
        return
      rows.value = Array.isArray(result?.rows) ? result.rows : []
      total.value = Math.max(0, Math.floor(Number(result?.total) || 0))
      loadedOnce = true
      // A page past the end (a stale bookmark, rows deleted since) moves back to
      // the last page that exists instead of showing an empty page.
      const lastPage = Math.max(1, Math.ceil(total.value / state.limit))
      if (state.page > lastPage)
        void apply({ ...state, page: lastPage })
    }
    catch (cause) {
      if (request !== generation)
        return
      rows.value = []
      total.value = 0
      error.value = resolveAdminErrorMessage(cause, errorFallback())
    }
    finally {
      if (request === generation)
        pending.value = false
    }
  }

  function load(): Promise<void> {
    if (disposed)
      return Promise.resolve()
    lastLoad = runLoad()
    return lastLoad
  }

  function apply(next: AppliedState<F>): Promise<void> {
    applied.value = next
    writeQuery(next)
    return load()
  }

  function applyFilters(): Promise<void> {
    cancelDebounce()
    const next = normalizeFilters(filters)
    if (sameFilters(next, applied.value.filters))
      return lastLoad
    return apply({ page: 1, limit: applied.value.limit, filters: next })
  }

  watch(
    () => filterKeys.map(key => filters[key]),
    () => {
      const next = normalizeFilters(filters)
      const changed = filterKeys.filter(key => next[key] !== applied.value.filters[key])
      if (!changed.length) {
        cancelDebounce()
        return
      }
      if (changed.every(key => debouncedKeys.has(key))) {
        cancelDebounce()
        debounceTimer = setTimeout(() => {
          debounceTimer = undefined
          void applyFilters()
        }, TEXT_FILTER_DEBOUNCE_MS)
        return
      }
      // A select or chip changed: apply now, together with any text still
      // waiting on its debounce.
      void applyFilters()
    },
  )

  if (route) {
    // The other direction: back / forward, or a link to this page with another
    // query. Our own `replace` lands here too and is recognised as no change.
    watch(() => route.query, () => {
      if (route.path !== ownPath)
        return
      const next = readQuery()
      const current = applied.value
      if (next.page === current.page && next.limit === current.limit && sameFilters(next.filters, current.filters))
        return
      cancelDebounce()
      applied.value = next
      Object.assign(filters, next.filters)
      void load()
    })
  }

  if (getCurrentInstance())
    onMounted(() => void load())
  else if (!import.meta.server)
    void load()

  onScopeDispose(() => {
    disposed = true
    cancelDebounce()
    // Drops any response still in flight: nothing writes state after unmount.
    generation += 1
  })

  return {
    rows,
    total,
    page: computed(() => applied.value.page),
    limit: computed(() => applied.value.limit),
    pageSizes,
    filters,
    appliedFilters: computed(() => applied.value.filters),
    loading: computed(() => pending.value && rows.value.length === 0),
    refreshing: computed(() => pending.value && rows.value.length > 0),
    error,
    hasActiveFilters: computed(() => filterKeys.some(key => applied.value.filters[key] !== options.defaults[key])),
    refresh() {
      return debounceTimer !== undefined ? applyFilters() : load()
    },
    clearFilters() {
      cancelDebounce()
      Object.assign(filters, options.defaults)
      void applyFilters()
    },
    setPage(page) {
      const current = applied.value
      if (!Number.isInteger(page) || page < 1 || page === current.page)
        return
      if (loadedOnce && page > Math.max(1, Math.ceil(total.value / current.limit)))
        return
      void apply({ ...current, page })
    },
    setLimit(limit) {
      const current = applied.value
      if (!Number.isInteger(limit) || limit < 1 || limit === current.limit)
        return
      void apply({ ...current, limit, page: 1 })
    },
  }
}
