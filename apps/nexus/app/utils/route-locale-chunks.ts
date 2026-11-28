import type { SupportedLocale } from '~/composables/useLocaleOrchestrator'
import { hasWindow } from '@talex-touch/utils/env'
import { recoverFromStaleChunkError } from '~/utils/chunk-recovery'

export type RouteLocaleChunkName = 'dashboard' | 'landing' | 'store'

export type RouteLocaleChunkMessages = Record<string, unknown>

type RouteLocaleChunkLoader = () => Promise<{ default: RouteLocaleChunkMessages }>

const routeLocaleChunkLoaders: Record<SupportedLocale, Record<RouteLocaleChunkName, RouteLocaleChunkLoader>> = {
  en: {
    dashboard: () => import('../../i18n/locales/route/en/dashboard'),
    landing: () => import('../../i18n/locales/route/en/landing'),
    store: () => import('../../i18n/locales/route/en/store'),
  },
  zh: {
    dashboard: () => import('../../i18n/locales/route/zh/dashboard'),
    landing: () => import('../../i18n/locales/route/zh/landing'),
    store: () => import('../../i18n/locales/route/zh/store'),
  },
}

const loadingChunks = new Map<string, Promise<RouteLocaleChunkMessages>>()

function getRouteLocaleChunkKey(locale: SupportedLocale, chunk: RouteLocaleChunkName) {
  return `${locale}:${chunk}`
}

export function normalizeRouteLocalePath(path: string) {
  const trimmed = path.replace(/^\/(en|zh)(?=\/|$)/i, '')
  return trimmed || '/'
}

export function resolveRouteLocaleChunks(path: string): RouteLocaleChunkName[] {
  const normalized = normalizeRouteLocalePath(path)
  const chunks: RouteLocaleChunkName[] = []

  if (normalized === '/' || normalized === '/new' || normalized.startsWith('/new/') || normalized === '/next' || normalized.startsWith('/next/'))
    chunks.push('landing')

  if (normalized === '/store' || normalized.startsWith('/store/'))
    chunks.push('store')

  /**
   * `/admin/*` is the administrator console, split out of `/dashboard/*` into
   * its own shell. Its pages still read `dashboard.*` keys — one message
   * namespace covers the whole signed-in surface — so it loads the same chunk,
   * or every console label renders its inline fallback instead.
   */
  if (
    normalized === '/dashboard'
    || normalized.startsWith('/dashboard/')
    || normalized === '/admin'
    || normalized.startsWith('/admin/')
    || normalized === '/team/join'
  ) {
    chunks.push('dashboard')
  }

  return chunks
}

export function registerActiveRouteLocaleChunk(
  activeChunks: readonly RouteLocaleChunkName[],
  chunk: RouteLocaleChunkName,
): RouteLocaleChunkName[] {
  return activeChunks.includes(chunk) ? [...activeChunks] : [...activeChunks, chunk]
}

export function resolveAllRouteLocaleChunks(
  path: string,
  activeChunks: readonly RouteLocaleChunkName[] = [],
): RouteLocaleChunkName[] {
  const routeChunks = resolveRouteLocaleChunks(path)
  if (activeChunks.length === 0)
    return routeChunks
  return Array.from(new Set([...routeChunks, ...activeChunks]))
}

export async function loadRouteLocaleChunk(locale: SupportedLocale, chunk: RouteLocaleChunkName) {
  const key = getRouteLocaleChunkKey(locale, chunk)
  const existing = loadingChunks.get(key)
  if (existing)
    return existing

  const promise = routeLocaleChunkLoaders[locale][chunk]()
    .then(module => module.default)
    .catch((error) => {
      if (hasWindow())
        recoverFromStaleChunkError(error)
      throw error
    })
    .finally(() => {
      loadingChunks.delete(key)
    })

  loadingChunks.set(key, promise)
  return promise
}
