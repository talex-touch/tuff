import type { Component, ComputedRef, InjectionKey, Ref, ShallowRef } from 'vue'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  hasDocPage,
  loadDocPage,
  resolveDocRouteKey,
  type TuffexCompiledDocMeta,
  type TuffexCompiledDocModule,
} from 'virtual:tuffex-doc-pages'
import {
  getCachedDocsNavigationItems,
  loadDocsNavigationItems,
  type DocsNavItem,
} from '~/composables/useDocsNavigation'
import { normalizeApiToc, type DocTocEntry } from '~/utils/docs-outline'
import {
  isTuffexInternalDocPath,
  parseTuffexRoute,
  stripTuffexBase,
  type ParsedTuffexRoute,
  type SupportedLocale,
} from '~/utils/docs-route'

export type { TuffexCompiledDocMeta, TuffexCompiledDocModule }

export interface DocPagerLink {
  title: string
  path: string
  slug: string
}

export interface TuffexCurrentDocContext {
  parsedRoute: ComputedRef<ParsedTuffexRoute>
  docLocale: ComputedRef<SupportedLocale>
  docSlug: ComputedRef<string>
  fetchedMeta: ShallowRef<TuffexCompiledDocMeta | null>
  displayMeta: ShallowRef<TuffexCompiledDocMeta | null>
  displayComponent: ShallowRef<Component | null>
  docOutline: ComputedRef<DocTocEntry[]>
  pagerPrev: ComputedRef<DocPagerLink | null>
  pagerNext: ComputedRef<DocPagerLink | null>
  pending: Ref<boolean>
  error: Ref<unknown>
  isSwitchingDoc: ComputedRef<boolean>
  notFound: ComputedRef<boolean>
  refresh: () => Promise<void>
  ready: Promise<void>
}

export const TUFFEX_CURRENT_DOC_KEY: InjectionKey<TuffexCurrentDocContext> = Symbol('tuffex-current-doc')

interface NavigatorWithConnection extends Navigator {
  connection?: {
    saveData?: boolean
  }
}

const NON_DOC_ASSET_RE = /\.(?:md|json|xml|txt|js|mjs|css|svg|png|jpe?g|webp|ico|woff2?)$/i

/**
 * In-memory module cache for compiled `.mdc` Vue 3 SFC modules.
 * Keeps SPA navigations synchronous (0ms) after hover/focus prefetch or revisit,
 * with zero build-time API requests and zero `_payload.json` / `__NUXT_DATA__` doc payloads.
 */
const loadedModules = new Map<string, TuffexCompiledDocModule>()
const inFlightLoads = new Map<string, Promise<TuffexCompiledDocModule | null>>()

function getCachedDocModule(locale: SupportedLocale, slug = ''): TuffexCompiledDocModule | null {
  if (import.meta.dev && import.meta.server)
    return null
  const key = resolveDocRouteKey(locale, slug)
  return loadedModules.get(key) ?? null
}

async function fetchCompiledDoc(
  locale: SupportedLocale,
  slug = '',
  options?: { bypassCache?: boolean },
): Promise<TuffexCompiledDocModule | null> {
  if (!hasDocPage(locale, slug))
    return null

  const key = resolveDocRouteKey(locale, slug)
  if (!options?.bypassCache) {
    const cached = getCachedDocModule(locale, slug)
    if (cached)
      return cached
  }

  const existing = inFlightLoads.get(key)
  if (existing)
    return existing

  const loadPromise = loadDocPage(locale, slug)
    .then((mod) => {
      if (mod)
        loadedModules.set(key, mod)
      return mod ?? null
    })
    .finally(() => {
      inFlightLoads.delete(key)
    })

  inFlightLoads.set(key, loadPromise)
  return loadPromise
}

/**
 * Prefetches a compiled `.mdc` page chunk once on hover/focus.
 * Guarded by `!navigator.connection?.saveData` and deduplicated against `loadedModules`
 * and `inFlightLoads`.
 */
export function prefetchDocPage(locale: SupportedLocale, slug = ''): void {
  if (!import.meta.client)
    return
  if (typeof navigator !== 'undefined' && (navigator as NavigatorWithConnection).connection?.saveData)
    return
  if (!hasDocPage(locale, slug))
    return

  const key = resolveDocRouteKey(locale, slug)
  if (loadedModules.has(key) || inFlightLoads.has(key))
    return

  void fetchCompiledDoc(locale, slug).catch(() => {})
}

/**
 * Resolves any internal TuffEx docs link (`/en/...`, `/zh/...`, `/tuffex/en/...`)
 * and triggers `prefetchDocPage` if it maps to a compiled `.mdc` page.
 */
export function prefetchDocByPath(rawPath: string | null | undefined): void {
  if (!import.meta.client || !rawPath)
    return
  const trimmed = rawPath.trim()
  if (!trimmed || trimmed.startsWith('#') || /^(?:https?:|mailto:|tel:|javascript:)/i.test(trimmed))
    return

  const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? ''
  if (!pathOnly || NON_DOC_ASSET_RE.test(pathOnly))
    return

  const stripped = stripTuffexBase(pathOnly)
  if (stripped.startsWith('/_tuffex/') || stripped.startsWith('/_i18n/'))
    return

  if (!isTuffexInternalDocPath(pathOnly))
    return

  const parsed = parseTuffexRoute(pathOnly)
  prefetchDocPage(parsed.locale, parsed.slug)
}

export function resolveDocOutline(doc: TuffexCompiledDocMeta | null): DocTocEntry[] {
  if (!doc?.toc)
    return []
  return normalizeApiToc(doc.toc)
}

function resolvePagerLinks(
  navItems: DocsNavItem[],
  slug: string,
): { prev: DocPagerLink | null, next: DocPagerLink | null } {
  if (!navItems.length)
    return { prev: null, next: null }

  const normalizedSlug = slug === 'index' ? '' : slug === 'concepts/index' ? 'concepts' : slug
  const index = navItems.findIndex(item => item.slug === normalizedSlug)
  if (index === -1)
    return { prev: null, next: null }

  const prevItem = index > 0 ? navItems[index - 1] : null
  const nextItem = index < navItems.length - 1 ? navItems[index + 1] : null

  return {
    prev: prevItem ? { title: prevItem.title, path: prevItem.path, slug: prevItem.slug } : null,
    next: nextItem ? { title: nextItem.title, path: nextItem.path, slug: nextItem.slug } : null,
  }
}

/**
 * Shared VitePress-style SSR-first document loader created synchronously inside `layouts/docs.vue`
 * (ALL `useRoute`, `shallowRef`, `computed`, and `watch` calls happen synchronously
 * before any `await` so Nuxt's async context and Vue's effect scope are never lost).
 *
 * `layouts/docs.vue` awaits `currentDoc.ready` at the end of `<script setup>` on BOTH SSR
 * and client initial hydration so:
 * 1. SSR byte-1 HTML renders the FULL compiled `<component :is="displayComponent" />`,
 *    FULL `<DocsSidebar />`, FULL `<DocsOutline />`, and FULL prev/next pager synchronously.
 * 2. Client initial hydration awaits the exact same ES module before mounting/hydrating
 *    with 0 hydration warnings and ZERO doc data serialized into `__NUXT_DATA__` / `_payload.json`.
 */
export function useTuffexCurrentDoc(): TuffexCurrentDocContext {
  const route = useRoute()

  const parsedRoute = computed(() => parseTuffexRoute(route.path))
  const docLocale = computed<SupportedLocale>(() => parsedRoute.value.locale)
  const docSlug = computed(() => parsedRoute.value.slug)

  const initialLocale = docLocale.value
  const initialSlug = docSlug.value
  const initialCachedModule = getCachedDocModule(initialLocale, initialSlug)
  const initialCachedNav = getCachedDocsNavigationItems(initialLocale)

  // NEVER wrap a compiled Vue component in deep-reactive `ref()` — always `shallowRef`!
  const displayComponent = shallowRef<Component | null>(initialCachedModule?.default ?? null)
  const displayMeta = shallowRef<TuffexCompiledDocMeta | null>(initialCachedModule?.docMeta ?? null)
  const fetchedMeta = shallowRef<TuffexCompiledDocMeta | null>(initialCachedModule?.docMeta ?? null)
  const activeNavItems = shallowRef<DocsNavItem[]>(initialCachedNav ?? [])

  const pending = ref(!initialCachedModule && hasDocPage(initialLocale, initialSlug))
  const error = ref<unknown>(null)

  const docOutline = computed<DocTocEntry[]>(() => resolveDocOutline(displayMeta.value))

  const pager = computed(() => {
    if (!displayMeta.value)
      return { prev: null, next: null }
    return resolvePagerLinks(activeNavItems.value, displayMeta.value.slug)
  })
  const pagerPrev = computed(() => pager.value.prev)
  const pagerNext = computed(() => pager.value.next)

  const isSwitchingDoc = computed(() => pending.value && Boolean(displayMeta.value))
  const notFound = computed(() => !pending.value && !fetchedMeta.value && !error.value)

  let loadGeneration = 0

  async function loadRoute(
    targetLocale: SupportedLocale,
    targetSlug: string,
    options?: { bypassCache?: boolean },
  ): Promise<void> {
    const generation = ++loadGeneration
    error.value = null

    if (!hasDocPage(targetLocale, targetSlug)) {
      pending.value = false
      fetchedMeta.value = null
      displayMeta.value = null
      displayComponent.value = null
      return
    }

    const cachedMod = options?.bypassCache ? null : getCachedDocModule(targetLocale, targetSlug)
    const cachedNav = getCachedDocsNavigationItems(targetLocale)

    // Synchronous 0ms fast-path when prefetched/cached!
    if (cachedMod && cachedNav) {
      pending.value = false
      activeNavItems.value = cachedNav
      fetchedMeta.value = cachedMod.docMeta
      displayMeta.value = cachedMod.docMeta
      displayComponent.value = cachedMod.default
      return
    }

    pending.value = true
    try {
      const [mod, navItems] = await Promise.all([
        cachedMod
          ? Promise.resolve(cachedMod)
          : fetchCompiledDoc(targetLocale, targetSlug, options),
        cachedNav
          ? Promise.resolve(cachedNav)
          : loadDocsNavigationItems(targetLocale).catch(() => [] as DocsNavItem[]),
      ])

      if (generation !== loadGeneration)
        return

      activeNavItems.value = navItems
      fetchedMeta.value = mod?.docMeta ?? null
      displayMeta.value = mod?.docMeta ?? null
      displayComponent.value = mod?.default ?? null
    }
    catch (err) {
      if (generation !== loadGeneration)
        return
      error.value = err
      fetchedMeta.value = null
      displayMeta.value = null
      displayComponent.value = null
    }
    finally {
      if (generation === loadGeneration)
        pending.value = false
    }
  }

  // Register route watcher synchronously inside active Vue component scope!
  watch(
    () => [docLocale.value, docSlug.value] as const,
    ([nextLocale, nextSlug], [prevLocale, prevSlug]) => {
      if (nextLocale === prevLocale && nextSlug === prevSlug)
        return
      void loadRoute(nextLocale, nextSlug)
    },
  )

  const ready = (initialCachedModule && initialCachedNav)
    ? Promise.resolve()
    : loadRoute(initialLocale, initialSlug)

  const refresh = () => loadRoute(docLocale.value, docSlug.value, { bypassCache: true })

  return {
    parsedRoute,
    docLocale,
    docSlug,
    fetchedMeta,
    displayMeta,
    displayComponent,
    docOutline,
    pagerPrev,
    pagerNext,
    pending,
    error,
    isSwitchingDoc,
    notFound,
    refresh,
    ready,
  }
}
