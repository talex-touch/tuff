import type { Plugin } from 'vite'

const EMPTY_PAGE_META_SFC = '<script>export default {}</script>'
const PAGE_META_MACRO_RE = /\bdefinePageMeta\s*\(/

function normalizePath(value: string) {
  return value.replace(/\\/g, '/')
}

export function transformEmptyPageMetaRequest(code: string, id: string, pagesRoot: string) {
  const queryIndex = id.indexOf('?')
  if (queryIndex === -1)
    return

  const file = normalizePath(id.slice(0, queryIndex))
  const normalizedPagesRoot = normalizePath(pagesRoot).replace(/\/$/, '')
  if (!file.startsWith(`${normalizedPagesRoot}/`))
    return

  const query = new URLSearchParams(id.slice(queryIndex + 1))
  if (query.get('macro') !== 'true' || query.has('type'))
    return

  if (PAGE_META_MACRO_RE.test(code))
    return

  return EMPTY_PAGE_META_SFC
}

export function nexusPageMetaFastPathPlugin(pagesRoot: string): Plugin {
  return {
    name: 'nexus:empty-page-meta-fast-path',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      return transformEmptyPageMetaRequest(code, id, pagesRoot)
    },
  }
}
