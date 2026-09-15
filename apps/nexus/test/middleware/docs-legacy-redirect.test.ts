import type { H3Event } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

  it('leaves already-localized and non-docs paths alone', () => {
    expect(handler(createRequest('/en/docs/dev/api/box.md'))).toBeUndefined()
    expect(handler(createRequest('/pricing'))).toBeUndefined()
  })
})
