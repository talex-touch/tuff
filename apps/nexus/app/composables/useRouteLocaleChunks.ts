import type { SupportedLocale } from '~/composables/useLocaleOrchestrator'
import type { RouteLocaleChunkName } from '~/utils/route-locale-chunks'
import { loadRouteLocaleChunk, registerActiveRouteLocaleChunk } from '~/utils/route-locale-chunks'

export const ACTIVE_ROUTE_LOCALE_CHUNKS_STATE_KEY = 'nexus-active-route-locale-chunks'

interface LocaleMessageMerger {
  mergeLocaleMessage: (locale: string, message: Record<string, unknown>) => void
}

interface ActiveRouteLocaleChunksState {
  value: RouteLocaleChunkName[]
}

export async function ensureRouteLocaleChunk(
  composer: LocaleMessageMerger,
  locale: SupportedLocale,
  chunk: RouteLocaleChunkName,
  activeChunksState?: ActiveRouteLocaleChunksState,
) {
  if (activeChunksState)
    activeChunksState.value = registerActiveRouteLocaleChunk(activeChunksState.value, chunk)
  const messages = await loadRouteLocaleChunk(locale, chunk)
  composer.mergeLocaleMessage(locale, {
    [chunk]: messages,
  })
}

export function useRouteLocaleChunks() {
  const composer = useI18n()
  const activeChunks = useState<RouteLocaleChunkName[]>(ACTIVE_ROUTE_LOCALE_CHUNKS_STATE_KEY, () => [])

  return {
    ensureRouteLocaleChunk: (locale: SupportedLocale, chunk: RouteLocaleChunkName) =>
      ensureRouteLocaleChunk(composer, locale, chunk, activeChunks),
  }
}
