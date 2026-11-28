import type { Component, ComputedRef, InjectionKey, Ref, ShallowRef } from 'vue'
import { hasNavigator } from '@talex-touch/utils/env'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  hasDocPage,
  loadDocPage,
  resolveDocRouteKey,
  type TuffWebCompiledDocMeta,
  type TuffWebCompiledDocModule,
} from 'virtual:tuff-web-doc-pages'
import {
  getCachedDocsNavigationItems,
  loadDocsNavigationItems,
  type TuffWebNavItem,
} from '~/composables/useDocsNavigation'
import { normalizeApiToc, type DocTocEntry } from '~/utils/docs-outline'
import {
  isExternalAppPath,
  parseDocsRoute,
  stripLocalePrefix,
  type ParsedDocsRoute,
  type SupportedLocale,
} from '~/utils/web-route'

export type { TuffWebCompiledDocMeta, TuffWebCompiledDocModule }

export interface DocPagerLink {
  title: string
  path: string
  slug: string
}

export interface TuffWebCurrentDocContext {
  parsedRoute: ComputedRef<ParsedDocsRoute>
  docLocale: ComputedRef<SupportedLocale>
  docSlug: ComputedRef<string>
  fetchedMeta: ShallowRef<TuffWebCompiledDocMeta | null>
  displayMeta: ShallowRef<TuffWebCompiledDocMeta | null>
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

export const TUFF_WEB_CURRENT_DOC_KEY: InjectionKey<TuffWebCurrentDocContext> = Symbol('tuff-web-current-doc')
export const TUFF_WEB_OUTLINE_KEY: InjectionKey<ComputedRef<DocTocEntry[]>> = Symbol('tuff-web-outline')

interface NavigatorWithConnection extends Navigator {
  connection?: {
    saveData?: boolean
  }
}

const NON_DOC_ASSET_RE = /\.(?:md|json|xml|txt|js|mjs|css|svg|png|jpe?g|webp|ico|woff2?)$/i

const loadedModules = new Map<string, TuffWebCompiledDocModule>()
const inFlightLoads = new Map<string, Promise<TuffWebCompiledDocModule | null>>()

function getCachedDocModule(locale: SupportedLocale, slug = ''): TuffWebCompiledDocModule | null {
  if (import.meta.dev && import.meta.server)
    return null
  return loadedModules.get(resolveDocRouteKey(locale, slug)) ?? null
}

async function fetchCompiledDoc(
  locale: SupportedLocale,
  slug = '',
  options?: { bypassCache?: boolean },
): Promise<TuffWebCompiledDocModule | null> {
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

  const promise = loadDocPage(locale, slug)
    .then((mod) => {
      if (mod)
        loadedModules.set(key, mod)
      return mod ?? null
    })
    .finally(() => {
      inFlightLoads.delete(key)
    })

  inFlightLoads.set(key, promise)
  return promise
}

export function prefetchDocPage(locale: SupportedLocale, slug = ''): void {
  if (!import.meta.client)
    return
  if (hasNavigator() && (navigator as NavigatorWithConnection).connection?.saveData)
    return
  if (!hasDocPage(locale, slug))
    return

  const key = resolveDocRouteKey(locale, slug)
  if (loadedModules.has(key) || inFlightLoads.has(key))
    return

  void fetchCompiledDoc(locale, slug).catch(() => {})
}

export function prefetchDocByPath(rawPath: string | null | undefined): void {
  if (!import.meta.client || !rawPath)
    return
  const trimmed = rawPath.trim()
  if (!trimmed || trimmed.startsWith('#') || /^(?:https?:|mailto:|tel:|javascript:)/i.test(trimmed))
    return

  const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? ''
  if (!pathOnly || NON_DOC_ASSET_RE.test(pathOnly) || isExternalAppPath(pathOnly))
    return

  const withoutLocale = stripLocalePrefix(pathOnly)
  if (withoutLocale !== '/docs' && !withoutLocale.startsWith('/docs/'))
    return

  const parsed = parseDocsRoute(pathOnly)
  prefetchDocPage(parsed.locale, parsed.slug)
}

export function resolveDocOutline(doc: TuffWebCompiledDocMeta | null): DocTocEntry[] {
  if (!doc?.toc)
    return []
  return normalizeApiToc(doc.toc)
}

function resolvePagerLinks(
  navItems: TuffWebNavItem[],
  slug: string,
): { prev: DocPagerLink | null, next: DocPagerLink | null } {
  if (!navItems.length)
    return { prev: null, next: null }

  const normalizedSlug = slug === 'index' ? '' : slug.replace(/\/index$/i, '')
  const index = navItems.findIndex(item => item.slug === normalizedSlug)
  if (index === -1)
    return { prev: null, next: null }

  const currentSection = navItems[index]?.section
  const prevItem = index > 0 && navItems[index - 1]?.section === currentSection ? navItems[index - 1] : null
  const nextItem = index < navItems.length - 1 && navItems[index + 1]?.section === currentSection ? navItems[index + 1] : null

  return {
    prev: prevItem ? { title: prevItem.title, path: prevItem.path, slug: prevItem.slug } : null,
    next: nextItem ? { title: nextItem.title, path: nextItem.path, slug: nextItem.slug } : null,
  }
}

export function useWebCurrentDoc(): TuffWebCurrentDocContext {
  const route = useRoute()

  const parsedRoute = computed(() => parseDocsRoute(route.path))
  const docLocale = computed<SupportedLocale>(() => parsedRoute.value.locale)
  const docSlug = computed(() => parsedRoute.value.slug)

  const initialLocale = docLocale.value
  const initialSlug = docSlug.value
  const initialCachedModule = getCachedDocModule(initialLocale, initialSlug)
  const initialCachedNav = getCachedDocsNavigationItems(initialLocale)

  const displayComponent = shallowRef<Component | null>(initialCachedModule?.default ?? null)
  const displayMeta = shallowRef<TuffWebCompiledDocMeta | null>(initialCachedModule?.docMeta ?? null)
  const fetchedMeta = shallowRef<TuffWebCompiledDocMeta | null>(initialCachedModule?.docMeta ?? null)
  const activeNavItems = shallowRef<TuffWebNavItem[]>(initialCachedNav ?? [])

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
          : loadDocsNavigationItems(targetLocale).catch(() => [] as TuffWebNavItem[]),
      ])

      if (generation !== loadGeneration)
        return

      activeNavItems.value = navItems
      fetchedMeta.value = mod?.docMeta ?? null
      displayMeta.value = mod?.docMeta ?? null
      displayComponent.value = mod?.default ?? null
      pending.value = false
    }
    catch (err) {
      if (generation !== loadGeneration)
        return
      error.value = err
      fetchedMeta.value = null
      displayMeta.value = null
      displayComponent.value = null
      pending.value = false
    }
    finally {
      if (generation === loadGeneration)
        pending.value = false
    }
  }

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
