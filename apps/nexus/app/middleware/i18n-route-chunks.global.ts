import { normalizeLocale } from '~/composables/useLocaleOrchestrator'
import { ensureRouteLocaleChunk } from '~/composables/useRouteLocaleChunks'
import { resolveRouteLocaleChunks } from '~/utils/route-locale-chunks'

export default defineNuxtRouteMiddleware(async (to) => {
  const chunks = resolveRouteLocaleChunks(to.path || '/')
  if (chunks.length === 0)
    return

  const i18n = useNuxtApp().$i18n
  const localeValue = typeof i18n.locale === 'string' ? i18n.locale : i18n.locale.value
  const currentLocale = normalizeLocale(localeValue) || 'en'

  await Promise.all(chunks.map(chunk => ensureRouteLocaleChunk(i18n, currentLocale, chunk)))
})
