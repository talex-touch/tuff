import type { SupportedLocale } from '~/composables/useLocaleOrchestrator'
import type { RouteLocaleChunkName } from '~/utils/route-locale-chunks'
import { useI18n, useState } from '#imports'
import { loadRouteLocaleChunk, registerActiveRouteLocaleChunk } from '~/utils/route-locale-chunks'

export const ACTIVE_ROUTE_LOCALE_CHUNKS_STATE_KEY = 'nexus-active-route-locale-chunks'
export const ROUTE_LOCALE_CHUNK_REVISION_STATE_KEY = 'nexus-route-locale-chunk-revision'

interface LocaleMessageMerger {
  mergeLocaleMessage: (locale: string, message: Record<string, unknown>) => void
}

interface ActiveRouteLocaleChunksState {
  value: RouteLocaleChunkName[]
}

interface RouteLocaleChunkRevisionState {
  value: number
}

export async function ensureRouteLocaleChunk(
  composer: LocaleMessageMerger,
  locale: SupportedLocale,
  chunk: RouteLocaleChunkName,
  activeChunksState?: ActiveRouteLocaleChunksState,
  revisionState?: RouteLocaleChunkRevisionState,
) {
  if (activeChunksState)
    activeChunksState.value = registerActiveRouteLocaleChunk(activeChunksState.value, chunk)
  const messages = await loadRouteLocaleChunk(locale, chunk)
  composer.mergeLocaleMessage(locale, {
    [chunk]: messages,
  })
  // vue-i18n holds messages in a shallowRef, so merging into an existing locale
  // does not invalidate rendered `t()` consumers unless they track this revision.
  if (revisionState)
    revisionState.value += 1
}

export function useRouteLocaleChunks() {
  const composer = useI18n()
  const activeChunks = useState<RouteLocaleChunkName[]>(ACTIVE_ROUTE_LOCALE_CHUNKS_STATE_KEY, () => [])
  const chunkRevision = useState<number>(ROUTE_LOCALE_CHUNK_REVISION_STATE_KEY, () => 0)

  return {
    chunkRevision,
    ensureRouteLocaleChunk: (locale: SupportedLocale, chunk: RouteLocaleChunkName) =>
      ensureRouteLocaleChunk(composer, locale, chunk, activeChunks, chunkRevision),
  }
}
