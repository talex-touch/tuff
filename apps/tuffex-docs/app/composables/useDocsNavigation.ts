import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { loadTuffexDocsNav } from '#build/tuffex-docs-nav'
import type { SupportedLocale } from '~/utils/docs-route'
import { normalizeTuffexDocPath } from '~/utils/docs-route'

export type SyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'

export interface DocsNavItem {
  title: string
  slug: string
  path: string
  canonicalPath: string
  locale: SupportedLocale
  category: string | null
  since: string | null
  status: string | null
  syncStatus: SyncStatusKey
  verified: boolean
  kind: 'component' | 'concept' | 'composition' | 'index'
}

const SYNC_STATUS_ALIASES: Record<string, SyncStatusKey> = {
  未迁移: 'not_started',
  迁移中: 'in_progress',
  已迁移: 'migrated',
  已确认: 'verified',
  not_started: 'not_started',
  in_progress: 'in_progress',
  migrated: 'migrated',
  verified: 'verified',
}

function fallbackTitleFromPath(path: string): string {
  const seg = path.split('/').filter(Boolean).pop() ?? 'Overview'
  return seg
    .replace(/\.(en|zh)$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function normalizeNavItems(payload: unknown, locale: SupportedLocale): DocsNavItem[] {
  const out: DocsNavItem[] = []
  const seen = new Set<string>()

  const pushNode = (node: Record<string, unknown>) => {
    const rawPath = typeof node.path === 'string'
      ? node.path
      : typeof node.slug === 'string'
        ? (node.slug.startsWith('/') ? node.slug : `/${node.slug}`)
        : ''
    if (!rawPath)
      return

    const canonicalPath = normalizeTuffexDocPath(rawPath)
    if (seen.has(canonicalPath))
      return
    seen.add(canonicalPath)

    const verified = node.verified === true
    const rawSync = typeof node.syncStatus === 'string'
      ? node.syncStatus.trim()
      : typeof node.status === 'string'
        ? node.status.trim()
        : ''
    const syncStatus: SyncStatusKey = verified
      ? 'verified'
      : (SYNC_STATUS_ALIASES[rawSync] ?? 'not_started')

    const kind: DocsNavItem['kind'] = canonicalPath === '/'
      ? 'index'
      : canonicalPath === '/composition'
        ? 'composition'
        : canonicalPath === '/concepts' || canonicalPath.startsWith('/concepts/')
          ? 'concept'
          : 'component'

    const slug = canonicalPath === '/' ? '' : canonicalPath.replace(/^\/+/, '')
    out.push({
      title: typeof node.title === 'string' && node.title.trim() ? node.title.trim() : fallbackTitleFromPath(canonicalPath),
      slug,
      path: canonicalPath === '/' ? `/${locale}` : `/${locale}${canonicalPath}`,
      canonicalPath,
      locale,
      category: typeof node.category === 'string' && node.category.trim() ? node.category.trim() : null,
      since: typeof node.since === 'string' && node.since.trim() ? node.since.trim() : null,
      status: typeof node.status === 'string' && node.status.trim() ? node.status.trim() : null,
      syncStatus,
      verified,
      kind,
    })
  }

  const visit = (value: unknown) => {
    if (!value)
      return
    if (Array.isArray(value)) {
      for (const item of value)
        visit(item)
      return
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>
      if (Array.isArray(obj.items)) {
        visit(obj.items)
        return
      }
      if (typeof obj.path === 'string' || typeof obj.slug === 'string')
        pushNode(obj)
      if (Array.isArray(obj.children))
        visit(obj.children)
    }
  }

  visit(payload)
  return out
}

const navModuleCache = new Map<SupportedLocale, DocsNavItem[]>()
const inFlightNavLoads = new Map<SupportedLocale, Promise<DocsNavItem[]>>()

export function getCachedDocsNavigationItems(loc: SupportedLocale): DocsNavItem[] | null {
  return navModuleCache.get(loc) ?? null
}

export async function loadDocsNavigationItems(loc: SupportedLocale): Promise<DocsNavItem[]> {
  const cached = navModuleCache.get(loc)
  if (cached)
    return cached

  const pending = inFlightNavLoads.get(loc)
  if (pending)
    return pending

  const loadPromise = loadTuffexDocsNav(loc)
    .then((navData) => {
      const items = normalizeNavItems(navData, loc)
      navModuleCache.set(loc, items)
      return items
    })
    .finally(() => {
      inFlightNavLoads.delete(loc)
    })

  inFlightNavLoads.set(loc, loadPromise)
  return loadPromise
}

/**
 * R2 + C2 Static Build-Time Nav Composable:
 * - Registers reactive refs & `watch(locale)` synchronously inside component setup
 *   scope BEFORE returning `ready` so `DocsSidebar.vue` can `await nav.ready` at
 *   the end of `<script setup>` without losing Vue/Nuxt context.
 */
export function useDocsNavigation(locale: Ref<SupportedLocale>) {
  const error = ref<Error | null>(null)
  const pending = ref(false)
  const items = ref<DocsNavItem[]>(navModuleCache.get(locale.value) ?? [])

  const load = async (loc: SupportedLocale) => {
    pending.value = true
    error.value = null
    try {
      items.value = await loadDocsNavigationItems(loc)
    }
    catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    }
    finally {
      pending.value = false
    }
  }

  watch(locale, (nextLocale) => {
    void load(nextLocale)
  })

  const ready = items.value.length > 0 ? Promise.resolve() : load(locale.value)

  return {
    items: computed(() => items.value),
    pending,
    error,
    ready,
    refresh: () => load(locale.value),
  }
}
