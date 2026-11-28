import { computed, getCurrentInstance, onMounted, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import { resolveErrorMessage } from '@/api/http'

export type ListFilters = Record<string, string>

export interface ListFetchParams<F extends ListFilters> {
  page: number
  limit: number
  filters: F
}

export interface ListPageResult<Row> {
  rows: Row[]
  total: number
}

export interface UseConsoleListOptions<Row, F extends ListFilters> {
  fetch: (params: ListFetchParams<F>) => Promise<ListPageResult<Row>>
  defaults: F
  defaultLimit?: number
  pageSizes?: number[]
  debounceKeys?: Array<keyof F & string>
  errorFallback?: string
}

const DEFAULT_PAGE_SIZES = [10, 20, 50]
const DEBOUNCE_MS = 280

export function sliceClientPage<Row>(items: Row[], page: number, limit: number): ListPageResult<Row> {
  const safeLimit = Math.max(1, limit)
  const total = items.length
  const maxPage = Math.max(1, Math.ceil(total / safeLimit))
  const safePage = Math.min(Math.max(1, page), maxPage)
  const start = (safePage - 1) * safeLimit
  return {
    rows: items.slice(start, start + safeLimit),
    total,
  }
}

export function shouldShowPager(input: { total: number, limit: number, page: number, pageSizes?: number[] }): boolean {
  if (input.total <= 0)
    return false
  if (input.page > 1 || input.total > input.limit)
    return true
  const sizes = (input.pageSizes ?? []).filter(s => Number.isInteger(s) && s > 0)
  return sizes.length > 0 && input.total > Math.min(...sizes)
}

export function useConsoleList<Row, F extends ListFilters>(options: UseConsoleListOptions<Row, F>) {
  const pageSizes = [...new Set((options.pageSizes ?? DEFAULT_PAGE_SIZES).filter(n => n > 0))].sort((a, b) => a - b)
  const defaultLimit = options.defaultLimit ?? 20
  const filterKeys = Object.keys(options.defaults) as Array<keyof F & string>
  const debounced = new Set<string>(options.debounceKeys ?? [])

  const page = ref(1)
  const limit = ref(defaultLimit)
  const filters = reactive({ ...options.defaults }) as F
  const appliedFilters = shallowRef<F>({ ...options.defaults })
  const rows = shallowRef<Row[]>([])
  const total = ref(0)
  const pending = ref(true)
  const error = ref<string | null>(null)

  let generation = 0
  let disposed = false
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  function normalizeFilters(): F {
    const out = { ...options.defaults } as Record<string, string>
    for (const key of filterKeys) {
      const value = filters[key]
      out[key] = typeof value === 'string'
        ? (debounced.has(key) ? value.trim() : value)
        : options.defaults[key]
    }
    return out as F
  }

  function clearDebounce() {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }
  }

  async function load(): Promise<void> {
    if (disposed)
      return
    const currentGen = ++generation
    pending.value = true
    error.value = null
    try {
      const result = await options.fetch({
        page: page.value,
        limit: limit.value,
        filters: { ...appliedFilters.value },
      })
      if (currentGen !== generation)
        return
      rows.value = Array.isArray(result.rows) ? result.rows : []
      total.value = Math.max(0, Math.floor(Number(result.total) || 0))
      const lastPage = Math.max(1, Math.ceil(total.value / limit.value))
      if (page.value > lastPage) {
        page.value = lastPage
        void load()
      }
    }
    catch (cause) {
      if (currentGen !== generation)
        return
      rows.value = []
      total.value = 0
      error.value = resolveErrorMessage(cause, options.errorFallback ?? 'Failed to load data.')
    }
    finally {
      if (currentGen === generation)
        pending.value = false
    }
  }

  function applyNow() {
    clearDebounce()
    appliedFilters.value = normalizeFilters()
    page.value = 1
    return load()
  }

  watch(
    () => filterKeys.map(k => filters[k]),
    () => {
      const next = normalizeFilters()
      const changed = filterKeys.filter(k => next[k] !== appliedFilters.value[k])
      if (!changed.length) {
        clearDebounce()
        return
      }
      if (changed.every(k => debounced.has(k))) {
        clearDebounce()
        debounceTimer = setTimeout(() => {
          debounceTimer = undefined
          void applyNow()
        }, DEBOUNCE_MS)
        return
      }
      void applyNow()
    },
  )

  if (getCurrentInstance())
    onMounted(() => void load())
  else
    void load()

  onScopeDispose(() => {
    disposed = true
    clearDebounce()
    generation += 1
  })

  return {
    rows,
    total,
    page,
    limit,
    pageSizes,
    filters,
    appliedFilters,
    loading: computed(() => pending.value && rows.value.length === 0),
    refreshing: computed(() => pending.value && rows.value.length > 0),
    error,
    hasActiveFilters: computed(() => filterKeys.some(k => appliedFilters.value[k] !== options.defaults[k])),
    refresh: () => (debounceTimer !== undefined ? applyNow() : load()),
    clearFilters: () => {
      clearDebounce()
      Object.assign(filters, options.defaults)
      appliedFilters.value = { ...options.defaults }
      page.value = 1
      void load()
    },
    setPage: (nextPage: number) => {
      if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage === page.value)
        return
      page.value = nextPage
      void load()
    },
    setLimit: (nextLimit: number) => {
      if (!Number.isInteger(nextLimit) || nextLimit < 1 || nextLimit === limit.value)
        return
      limit.value = nextLimit
      page.value = 1
      void load()
    },
  }
}
