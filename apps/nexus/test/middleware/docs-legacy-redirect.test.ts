import type { H3Event } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { docsStaticRedirects } from '../../build/nexus-static-routes.mjs'

interface RedirectResult {
  location: string
  status: number
}

const requestUrls = new WeakMap<object, URL>()
const globalNames = ['defineEventHandler', 'getRequestURL', 'sendRedirect'] as const
const originalGlobals = new Map<string, { hadOwnProperty: boolean, value: unknown }>()

let handler: typeof import('../../server/middleware/docs-legacy-redirect').default

function installGlobal(name: string, value: unknown) {
  originalGlobals.set(name, {
    hadOwnProperty: Object.hasOwn(globalThis, name),
    value: Reflect.get(globalThis, name),
  })
  Reflect.set(globalThis, name, value)
}

function createRequest(url: string): H3Event {
  // The middleware reads the event only through the test-installed globals below.
  const requestUrl = new URL(url, 'https://nexus.example.test')
  const event = { method: 'GET', path: requestUrl.pathname } as unknown as H3Event
  requestUrls.set(event, requestUrl)
  return event
}

beforeAll(async () => {
  installGlobal('defineEventHandler', (callback: typeof handler) => callback)
  installGlobal('getRequestURL', (event: object) => {
    const url = requestUrls.get(event)
    if (!url)
      throw new Error('Missing request fixture')
    return url
  })
  installGlobal('sendRedirect', (_event: object, location: string, status: number): RedirectResult => ({ location, status }))
  // Imported after the globals exist: the handler calls `defineEventHandler` at module scope,
  // so a static import would evaluate it before the stubs are installed.
  handler = (await import('../../server/middleware/docs-legacy-redirect')).default
})

afterAll(() => {
  for (const name of globalNames) {
    const original = originalGlobals.get(name)
    if (!original)
      continue
    if (original.hadOwnProperty)
      Reflect.set(globalThis, name, original.value)
    else Reflect.deleteProperty(globalThis, name)
  }
})

describe('docs legacy redirect middleware', () => {
  it('keeps the .md suffix when localizing a raw-source request', () => {
    // The redirect routes through normalizeDocsPagePath, which treats `.md` as a content
    // extension and strips it. Without the suffix carve-out an agent asking for the source
    // is silently redirected to the rendered page instead.
    expect(handler(createRequest('/docs/dev/api/box.md'))).toEqual({
      location: '/en/docs/dev/api/box.md',
      status: 308,
    })
  })

  it('still localizes an ordinary docs path to the rendered page', () => {
    expect(handler(createRequest('/docs/dev/api/box?tab=usage'))).toEqual({
      location: '/en/docs/dev/api/box?tab=usage',
      status: 308,
    })
  })

  it('resolves a locale-suffixed content link to the page, not its source', () => {
    // Negative control for the first case: `.en.md` names a content file that docs link to,
    // so the two rules must not collapse into one.
    expect(handler(createRequest('/docs/dev/api/box.en.md'))).toEqual({
      location: '/en/docs/dev/api/box',
      status: 308,
    })
  })

  it('redirects moved TuffEx component, concept, composition, and llms routes to /tuffex/* with 308', () => {
    const cases: Array<[string, string]> = [
      ['/en/docs/dev/components', '/tuffex/en'],
      ['/en/docs/dev/components/button?tab=api', '/tuffex/en/button?tab=api'],
      ['/zh/docs/dev/components', '/tuffex/zh'],
      ['/zh/docs/dev/components/tabs', '/tuffex/zh/tabs'],
      ['/en/docs/dev/concepts', '/tuffex/en/concepts'],
      ['/en/docs/dev/concepts/surface-taxonomy', '/tuffex/en/concepts/surface-taxonomy'],
      ['/zh/docs/dev/concepts', '/tuffex/zh/concepts'],
      ['/zh/docs/dev/concepts/dark-palette', '/tuffex/zh/concepts/dark-palette'],
      ['/docs/dev/components', '/tuffex/en'],
      ['/docs/dev/components/button', '/tuffex/en/button'],
      ['/docs/dev/concepts', '/tuffex/en/concepts'],
      ['/docs/dev/concepts/depth-topology', '/tuffex/en/concepts/depth-topology'],
      ['/en/docs/dev/getting-started/tuffex-composition', '/tuffex/en/composition'],
      ['/zh/docs/dev/getting-started/tuffex-composition', '/tuffex/zh/composition'],
      ['/llms.txt', '/tuffex/llms.txt'],
    ]

    for (const [from, location] of cases) {
      expect(handler(createRequest(from)), from).toEqual({ location, status: 308 })
    }
  })

  it('leaves already-localized and non-docs paths alone', () => {
    expect(handler(createRequest('/en/docs/dev/api/box.md'))).toBeUndefined()
    expect(handler(createRequest('/pricing'))).toBeUndefined()
  })
})

/**
 * Applies the `_redirects` rules the way Cloudflare Pages does: first matching source wins, a
 * trailing `*` is greedy and lands in `:splat`. This is the production path for `/docs/**`;
 * the middleware above is what development and the Worker fallback run.
 */
function applyStaticRedirect(pathname: string): RedirectResult | undefined {
  for (const rule of docsStaticRedirects) {
    if (rule.from.endsWith('/*')) {
      const prefix = rule.from.slice(0, -1)
      if (pathname.startsWith(prefix))
        return { location: rule.to.replace(':splat', pathname.slice(prefix.length)), status: rule.status }
      continue
    }
    if (pathname === rule.from)
      return { location: rule.to, status: rule.status }
  }
  return undefined
}

describe('docs legacy redirect parity with the static _redirects rules', () => {
  it('sends every canonical docs and TuffEx redirect path to the same place by both routes', () => {
    for (const pathname of [
      '/docs',
      '/docs/dev',
      '/docs/dev/api/box',
      '/docs/dev/api/box.md',
      '/docs/guide/start',
      '/en/docs/dev/components',
      '/en/docs/dev/components/button',
      '/en/docs/dev/components/button.md',
      '/zh/docs/dev/components',
      '/zh/docs/dev/components/tabs',
      '/en/docs/dev/concepts',
      '/en/docs/dev/concepts/surface-taxonomy',
      '/zh/docs/dev/concepts',
      '/zh/docs/dev/concepts/dark-palette',
      '/docs/dev/components',
      '/docs/dev/components/button',
      '/docs/dev/concepts',
      '/docs/dev/concepts/depth-topology',
      '/en/docs/dev/getting-started/tuffex-composition',
      '/zh/docs/dev/getting-started/tuffex-composition',
      '/llms.txt',
    ]) {
      const viaPages = applyStaticRedirect(pathname)
      expect(viaPages, pathname).toBeDefined()
      expect(handler(createRequest(pathname)), pathname).toEqual(viaPages)
    }
  })

  it('orders all TuffEx splat rules before the /docs/* catch-all', () => {
    const docsWildcardIndex = docsStaticRedirects.findIndex(rule => rule.from === '/docs/*')
    expect(docsWildcardIndex).toBeGreaterThan(0)
    for (const from of [
      '/en/docs/dev/components/*',
      '/zh/docs/dev/components/*',
      '/en/docs/dev/concepts/*',
      '/zh/docs/dev/concepts/*',
      '/docs/dev/components/*',
      '/docs/dev/concepts/*',
    ]) {
      const index = docsStaticRedirects.findIndex(rule => rule.from === from)
      expect(index, from).toBeGreaterThanOrEqual(0)
      expect(index, `${from} must appear before /docs/*`).toBeLessThan(docsWildcardIndex)
    }
  })

  it('leaves the already-localized paths to the static files, as the middleware does', () => {
    expect(applyStaticRedirect('/en/docs/dev/api/box')).toBeUndefined()
    expect(applyStaticRedirect('/pricing')).toBeUndefined()
  })

  it('documents the one divergence: a splat cannot normalize a locale-suffixed content name', () => {
    // The middleware resolves `/docs/x.en.md` to the page; the static rule forwards the name
    // as typed and lets the excluded `/en/docs/*` answer with the real 404. Recorded so the
    // divergence is a decision, not a drift.
    expect(applyStaticRedirect('/docs/dev/api/box.en.md')).toEqual({ location: '/en/docs/dev/api/box.en.md', status: 308 })
    expect(handler(createRequest('/docs/dev/api/box.en.md'))).toEqual({ location: '/en/docs/dev/api/box', status: 308 })
  })
})
