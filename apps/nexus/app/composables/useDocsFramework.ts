import { computed, onMounted, watch } from 'vue'
import type { DocsFramework } from '~/data/tuffex-framework-matrix'
import {
  DOCS_FRAMEWORK_META,
  DOCS_FRAMEWORKS,
  isDocsFramework,
  normalizeDocsFramework,
} from '~/data/tuffex-framework-matrix'

export const DOCS_FRAMEWORK_STORAGE_KEY = 'nexus.docs.framework'
export const DOCS_FRAMEWORK_QUERY_KEY = 'framework'
export const DOCS_FRAMEWORK_STATE_KEY = 'docs-framework'

let clientHydratedFlag = false

export function readFrameworkFromQuery(query: Record<string, unknown> | undefined): DocsFramework | null {
  if (!query)
    return null
  const raw = query[DOCS_FRAMEWORK_QUERY_KEY]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !value.trim())
    return null
  const normalized = normalizeDocsFramework(value, 'vue')
  return isDocsFramework(normalized) && ['vue', 'vue3', 'react', 'tsx', 'wc', 'web-components', 'webcomponents'].includes(value.trim().toLowerCase())
    ? normalized
    : null
}

export function readFrameworkFromStorage(storage?: Pick<Storage, 'getItem'> | null): DocsFramework | null {
  if (!storage)
    return null
  try {
    const raw = storage.getItem(DOCS_FRAMEWORK_STORAGE_KEY)
    if (!raw)
      return null
    return isDocsFramework(raw) ? raw : normalizeDocsFramework(raw)
  }
  catch {
    return null
  }
}

export function writeFrameworkToStorage(framework: DocsFramework, storage?: Pick<Storage, 'setItem'> | null): void {
  if (!storage)
    return
  try {
    storage.setItem(DOCS_FRAMEWORK_STORAGE_KEY, framework)
  }
  catch {
    // Ignore storage quota or private-mode errors.
  }
}

export function resolveInitialClientFramework(options: {
  query?: Record<string, unknown>
  storage?: Pick<Storage, 'getItem'> | null
  fallback?: DocsFramework
}): DocsFramework {
  const fromQuery = readFrameworkFromQuery(options.query)
  if (fromQuery)
    return fromQuery
  const fromStorage = readFrameworkFromStorage(options.storage)
  if (fromStorage)
    return fromStorage
  return options.fallback ?? 'vue'
}

export function buildQueryWithFramework(
  currentQuery: Record<string, unknown>,
  framework: DocsFramework,
): Record<string, unknown> {
  const nextQuery: Record<string, unknown> = { ...currentQuery }
  if (framework === 'vue')
    delete nextQuery[DOCS_FRAMEWORK_QUERY_KEY]
  else
    nextQuery[DOCS_FRAMEWORK_QUERY_KEY] = framework
  return nextQuery
}

/**
 * Shared, SSR-safe docs framework switcher state (`vue` | `react` | `wc`).
 *
 * SSR always starts on `'vue'` so static HTML and initial hydration agree.
 * On the client, `?framework=` takes precedence over `localStorage`, and changes
 * persist to both `localStorage` and the URL query string.
 */
export function useDocsFramework() {
  const framework = useState<DocsFramework>(DOCS_FRAMEWORK_STATE_KEY, () => 'vue')
  const route = useRoute()
  const router = useRouter()

  const activeMeta = computed(() => DOCS_FRAMEWORK_META[framework.value])

  function syncUrlQuery(next: DocsFramework) {
    if (!import.meta.client)
      return
    const currentFromQuery = readFrameworkFromQuery(route.query as Record<string, unknown>)
    const expectedQueryValue = next === 'vue' ? null : next
    if (currentFromQuery === expectedQueryValue)
      return
    const nextQuery = buildQueryWithFramework(route.query as Record<string, unknown>, next)
    void router.replace({
      path: route.path,
      query: nextQuery as Record<string, string | string[] | null | undefined>,
      hash: route.hash,
    })
  }

  function setFramework(next: DocsFramework) {
    const normalized = normalizeDocsFramework(next)
    framework.value = normalized
    if (import.meta.client) {
      writeFrameworkToStorage(normalized, window.localStorage)
      syncUrlQuery(normalized)
    }
  }

  if (import.meta.client) {
    onMounted(() => {
      if (!clientHydratedFlag) {
        clientHydratedFlag = true
        const resolved = resolveInitialClientFramework({
          query: route.query as Record<string, unknown>,
          storage: window.localStorage,
          fallback: framework.value,
        })
        framework.value = resolved
        writeFrameworkToStorage(resolved, window.localStorage)
      }
      else {
        const fromQuery = readFrameworkFromQuery(route.query as Record<string, unknown>)
        if (fromQuery && fromQuery !== framework.value) {
          framework.value = fromQuery
          writeFrameworkToStorage(fromQuery, window.localStorage)
        }
      }
    })

    watch(
      () => route.query[DOCS_FRAMEWORK_QUERY_KEY],
      () => {
        const fromQuery = readFrameworkFromQuery(route.query as Record<string, unknown>)
        if (fromQuery && fromQuery !== framework.value) {
          framework.value = fromQuery
          writeFrameworkToStorage(fromQuery, window.localStorage)
        }
      },
    )
  }

  return {
    framework,
    frameworks: DOCS_FRAMEWORKS,
    activeMeta,
    setFramework,
  }
}
