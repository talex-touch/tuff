import type { RouteLocaleChunkName } from '~/utils/route-locale-chunks'
import type { SupportedLocale } from '~/composables/useLocaleOrchestrator'
import { loadRouteLocaleChunk } from '~/utils/route-locale-chunks'

interface LocaleMessageMerger {
  mergeLocaleMessage: (locale: string, message: Record<string, unknown>) => void
}

export async function ensureRouteLocaleChunk(
  composer: LocaleMessageMerger,
  locale: SupportedLocale,
  chunk: RouteLocaleChunkName,
) {
  const messages = await loadRouteLocaleChunk(locale, chunk)
  composer.mergeLocaleMessage(locale, {
    [chunk]: messages,
  })
}

export function useRouteLocaleChunks() {
  const composer = useI18n()

  return {
    ensureRouteLocaleChunk: (locale: SupportedLocale, chunk: RouteLocaleChunkName) =>
      ensureRouteLocaleChunk(composer, locale, chunk),
  }
}
