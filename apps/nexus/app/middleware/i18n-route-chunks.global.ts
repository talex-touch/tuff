import { normalizeLocale } from '~/composables/useLocaleOrchestrator'
import { ensureRouteLocaleChunk } from '~/composables/useRouteLocaleChunks'
import type { RouteLocaleChunkName } from '~/utils/route-locale-chunks'

function normalizeRoutePath(path: string) {
  const trimmed = path.replace(/^\/(en|zh)(?=\/|$)/i, '')
  return trimmed || '/'
}

function resolveRouteLocaleChunks(path: string): RouteLocaleChunkName[] {
  const normalized = normalizeRoutePath(path)
  const chunks: RouteLocaleChunkName[] = []

  if (normalized === '/' || normalized === '/new' || normalized.startsWith('/new/'))
    chunks.push('landing')

  if (
    normalized === '/dashboard'
    || normalized.startsWith('/dashboard/')
    || normalized === '/store'
    || normalized.startsWith('/store/')
    || normalized === '/team/join'
  ) {
    chunks.push('dashboard')
  }

  return chunks
}

export default defineNuxtRouteMiddleware(async (to) => {
  const chunks = resolveRouteLocaleChunks(to.path || '/')
  if (chunks.length === 0)
    return

  const i18n = useNuxtApp().$i18n
  const localeValue = typeof i18n.locale === 'string' ? i18n.locale : i18n.locale.value
  const currentLocale = normalizeLocale(localeValue) || 'en'

  await Promise.all(chunks.map(chunk => ensureRouteLocaleChunk(i18n, currentLocale, chunk)))
})
