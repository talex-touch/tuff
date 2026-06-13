import type { DocsLocale } from '#shared/utils/docs-path'
import {
  normalizeDocsPagePath,
  resolveDocsLocaleFromRoute,
  toLocalizedDocsPath,
} from '#shared/utils/docs-path'

export function useDocsRoute() {
  const route = useRoute()
  const docsLocale = computed<DocsLocale>(() => resolveDocsLocaleFromRoute(route.path))
  const docsPath = computed(() => normalizeDocsPagePath(route.path))

  const localizedDocsPath = (path: string | null | undefined, locale: DocsLocale = docsLocale.value) => {
    return toLocalizedDocsPath(path, locale)
  }

  return {
    docsLocale,
    docsPath,
    localizedDocsPath,
  }
}
