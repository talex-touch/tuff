import { DOCS_SUPPORTED_LOCALES, isDocsLocale, normalizeDocsPagePath, type DocsLocale } from './docs-path'

/**
 * Raw-source URLs for docs pages: append `.md` to any docs route and get the Markdown the page
 * was built from, the way Apple's developer documentation exposes its sources. Agents read the
 * source instead of scraping rendered HTML.
 *
 * The suffix is deliberately narrow. Content files are named `button.en.mdc`, and docs cross-link
 * each other by that file name, so `/en/docs/dev/components/button.en.md` already means "the page"
 * and is normalized to it by `normalizeDocsPagePath`. Only a path with no locale suffix asks for
 * the source; anything else keeps its existing meaning.
 */
const MARKDOWN_SUFFIX_PATTERN = /\.md$/i
const LOCALE_SUFFIXED_MARKDOWN_PATTERN = /\.(en|zh)\.md$/i
const LOCALIZED_DOCS_MARKDOWN_PATTERN = /^\/(en|zh)(\/docs(?:\/.*)?)\.md$/i

export interface DocsMarkdownRoute {
  locale: DocsLocale
  /** The canonical `/docs/...` page path whose source was requested. */
  path: string
}

/** Whether a path asks for raw Markdown rather than naming a page by its content file. */
export function isDocsMarkdownRequestPath(pathname: string | null | undefined) {
  if (!pathname)
    return false

  return MARKDOWN_SUFFIX_PATTERN.test(pathname) && !LOCALE_SUFFIXED_MARKDOWN_PATTERN.test(pathname)
}

/** Parses `/<locale>/docs/<path>.md`; `null` for anything that is not exactly that shape. */
export function parseDocsMarkdownRoute(pathname: string | null | undefined): DocsMarkdownRoute | null {
  if (!isDocsMarkdownRequestPath(pathname))
    return null

  const match = pathname!.match(LOCALIZED_DOCS_MARKDOWN_PATTERN)
  if (!match)
    return null

  const [, locale, docPath] = match
  if (!isDocsLocale(locale))
    return null

  return { locale, path: normalizeDocsPagePath(docPath) }
}

/** The raw-source URL of one document in one locale. The docs root becomes `/<locale>/docs.md`. */
export function toDocsMarkdownPath(path: string | null | undefined, locale: DocsLocale) {
  return `/${locale}${normalizeDocsPagePath(path)}.md`
}

/** Every raw-source URL a document owns: one per locale. */
export function toDocsMarkdownPaths(path: string | null | undefined) {
  return DOCS_SUPPORTED_LOCALES.map(locale => toDocsMarkdownPath(path, locale))
}
