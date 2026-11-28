import {
  loadTuffWebDocsNav,
  type DocsSectionKey,
  type TuffWebLocaleNavigation,
  type TuffWebNavGroup,
  type TuffWebNavItem,
  type TuffWebNavSection,
} from '#build/tuff-web-docs-nav'
import type { SupportedLocale } from '~/utils/web-route'

export type {
  DocsSectionKey,
  TuffWebLocaleNavigation,
  TuffWebNavGroup,
  TuffWebNavItem,
  TuffWebNavSection,
}

const navCache = new Map<SupportedLocale, TuffWebLocaleNavigation>()
const navInFlight = new Map<SupportedLocale, Promise<TuffWebLocaleNavigation>>()

export function getCachedDocsNavigation(locale: SupportedLocale): TuffWebLocaleNavigation | null {
  return navCache.get(locale) ?? null
}

export function getCachedDocsNavigationItems(locale: SupportedLocale): TuffWebNavItem[] | null {
  return navCache.get(locale)?.items ?? null
}

export async function loadDocsNavigation(locale: SupportedLocale): Promise<TuffWebLocaleNavigation> {
  const cached = navCache.get(locale)
  if (cached)
    return cached

  const existing = navInFlight.get(locale)
  if (existing)
    return existing

  const promise = loadTuffWebDocsNav(locale)
    .then((nav) => {
      navCache.set(locale, nav)
      return nav
    })
    .finally(() => {
      navInFlight.delete(locale)
    })

  navInFlight.set(locale, promise)
  return promise
}

export async function loadDocsNavigationItems(locale: SupportedLocale): Promise<TuffWebNavItem[]> {
  const nav = await loadDocsNavigation(locale)
  return nav.items
}
