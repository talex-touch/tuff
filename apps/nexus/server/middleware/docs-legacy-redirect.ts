import { toLocalizedDocsPath } from '#shared/utils/docs-path'
import { isDocsMarkdownRequestPath, toDocsMarkdownPath } from '#shared/utils/docs-markdown'

const TUFFEX_EXACT_REDIRECTS: Readonly<Record<string, string>> = {
  '/en/docs/dev/components': '/tuffex/en',
  '/zh/docs/dev/components': '/tuffex/zh',
  '/en/docs/dev/concepts': '/tuffex/en/concepts',
  '/zh/docs/dev/concepts': '/tuffex/zh/concepts',
  '/docs/dev/components': '/tuffex/en',
  '/docs/dev/concepts': '/tuffex/en/concepts',
  '/en/docs/dev/getting-started/tuffex-composition': '/tuffex/en/composition',
  '/zh/docs/dev/getting-started/tuffex-composition': '/tuffex/zh/composition',
  '/tuffex/en/motion-toggle': '/tuffex/en/motion-button',
  '/tuffex/zh/motion-toggle': '/tuffex/zh/motion-button',
  '/tuffex/motion-toggle': '/tuffex/en/motion-button',
  '/llms.txt': '/tuffex/llms.txt',
}

const TUFFEX_COMPONENT_SLUG_REDIRECTS: Readonly<Record<string, string>> = {
  'motion-toggle': 'motion-button',
  'motion-toggle/': 'motion-button',
  'motion-toggle.md': 'motion-button.md',
}

const TUFFEX_PREFIX_REDIRECTS: ReadonlyArray<{ prefix: string, targetPrefix: string, isComponent?: boolean }> = [
  { prefix: '/en/docs/dev/components/', targetPrefix: '/tuffex/en/', isComponent: true },
  { prefix: '/zh/docs/dev/components/', targetPrefix: '/tuffex/zh/', isComponent: true },
  { prefix: '/en/docs/dev/concepts/', targetPrefix: '/tuffex/en/concepts/' },
  { prefix: '/zh/docs/dev/concepts/', targetPrefix: '/tuffex/zh/concepts/' },
  { prefix: '/docs/dev/components/', targetPrefix: '/tuffex/en/', isComponent: true },
  { prefix: '/docs/dev/concepts/', targetPrefix: '/tuffex/en/concepts/' },
]

function resolveTuffexRedirectTarget(pathname: string): string | null {
  const exact = TUFFEX_EXACT_REDIRECTS[pathname]
  if (exact)
    return exact

  for (const rule of TUFFEX_PREFIX_REDIRECTS) {
    if (pathname.startsWith(rule.prefix)) {
      const rest = pathname.slice(rule.prefix.length)
      const mapped = rule.isComponent && Object.hasOwn(TUFFEX_COMPONENT_SLUG_REDIRECTS, rest)
        ? TUFFEX_COMPONENT_SLUG_REDIRECTS[rest]
        : rest
      return `${rule.targetPrefix}${mapped}`
    }
  }

  return null
}

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const tuffexTarget = resolveTuffexRedirectTarget(url.pathname)
  if (tuffexTarget)
    return sendRedirect(event, `${tuffexTarget}${url.search}`, 308)

  if (!/^\/docs(?=\/|$)/.test(url.pathname))
    return

  // A raw-source request keeps its `.md`: `normalizeDocsPagePath` treats the suffix as a
  // content extension and would strip it, redirecting the agent to the rendered page instead.
  const localized = isDocsMarkdownRequestPath(url.pathname)
    ? toDocsMarkdownPath(url.pathname, 'en')
    : toLocalizedDocsPath(url.pathname, 'en')

  const target = `${localized}${url.search}`
  if (target === `${url.pathname}${url.search}`)
    return

  return sendRedirect(event, target, 308)
})
