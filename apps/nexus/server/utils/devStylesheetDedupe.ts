const TUFFEX_SOURCE_STYLESHEET_MARKER = '/packages/tuffex/packages/components/'
const STYLESHEET_LINK_RE = /<link\b(?=[^>]*\brel=(["'])stylesheet\1)(?=[^>]*\bhref=(["'])([^"']+)\2)[^>]*>/gi

function normalizeTuffexStylesheetHref(href: string) {
  if (!href.startsWith('/_nuxt/'))
    return null
  if (!href.includes(TUFFEX_SOURCE_STYLESHEET_MARKER))
    return null

  const [path, query = ''] = href.split('?', 2)
  const normalizedPath = path.replace(/^\/_nuxt\/@fs\//, '/_nuxt/')
  return query ? `${normalizedPath}?${query}` : normalizedPath
}

export function dedupeDevTuffexStylesheets(html: string) {
  const seen = new Set<string>()

  return html.replace(STYLESHEET_LINK_RE, (link, _relQuote, _hrefQuote, href: string) => {
    const key = normalizeTuffexStylesheetHref(href)
    if (!key)
      return link

    if (seen.has(key))
      return ''

    seen.add(key)
    return link
  })
}
