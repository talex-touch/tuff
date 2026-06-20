import type { SupportedLocale } from '~/composables/useLocaleOrchestrator'

export type RouteLocaleChunkName = 'dashboard' | 'landing'

export type RouteLocaleChunkMessages = Record<string, unknown>

type RouteLocaleChunkLoader = () => Promise<{ default: RouteLocaleChunkMessages }>

const routeLocaleChunkLoaders: Record<SupportedLocale, Record<RouteLocaleChunkName, RouteLocaleChunkLoader>> = {
  en: {
    dashboard: () => import('../../i18n/locales/route/en/dashboard'),
    landing: () => import('../../i18n/locales/route/en/landing'),
  },
  zh: {
    dashboard: () => import('../../i18n/locales/route/zh/dashboard'),
    landing: () => import('../../i18n/locales/route/zh/landing'),
  },
}

const loadingChunks = new Map<string, Promise<RouteLocaleChunkMessages>>()

function getRouteLocaleChunkKey(locale: SupportedLocale, chunk: RouteLocaleChunkName) {
  return `${locale}:${chunk}`
}

export async function loadRouteLocaleChunk(locale: SupportedLocale, chunk: RouteLocaleChunkName) {
  const key = getRouteLocaleChunkKey(locale, chunk)
  const existing = loadingChunks.get(key)
  if (existing)
    return existing

  const promise = routeLocaleChunkLoaders[locale][chunk]()
    .then(module => module.default)
    .finally(() => {
      loadingChunks.delete(key)
    })

  loadingChunks.set(key, promise)
  return promise
}
