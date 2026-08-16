import type { H3Event } from 'h3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

interface RequestFixture {
  accept: string
  url: URL
}

interface RedirectResult {
  location: string
  status: number
}

const runtimeConfig = { auth: { origin: '' } }
const requestFixtures = new WeakMap<object, RequestFixture>()
const globalNames = ['defineEventHandler', 'getHeader', 'getRequestURL', 'sendRedirect', 'useRuntimeConfig'] as const
const originalGlobals = new Map<string, { hadOwnProperty: boolean; value: unknown }>()
const originalNodeEnv = process.env.NODE_ENV

let handler: typeof import('../../server/middleware/canonical-origin').default

function installGlobal(name: string, value: unknown) {
  originalGlobals.set(name, {
    hadOwnProperty: Object.hasOwn(globalThis, name),
    value: Reflect.get(globalThis, name),
  })
  Reflect.set(globalThis, name, value)
}

function createPageRequest(url: string): H3Event {
  // The middleware only reads the event through the test-installed global helpers below.
  const requestUrl = new URL(url)
  const event = {
    method: 'GET',
    path: requestUrl.pathname,
  } as unknown as H3Event
  requestFixtures.set(event, { accept: 'text/html', url: requestUrl })
  return event
}

beforeAll(async () => {
  installGlobal('defineEventHandler', (callback: typeof handler) => callback)
  installGlobal('getHeader', (event: object, name: string) => {
    if (name !== 'accept') return undefined
    return requestFixtures.get(event)?.accept
  })
  installGlobal('getRequestURL', (event: object) => {
    const fixture = requestFixtures.get(event)
    if (!fixture) throw new Error('Missing request fixture')
    return fixture.url
  })
  installGlobal('sendRedirect', (_event: object, location: string, status: number): RedirectResult => ({ location, status }))
  installGlobal('useRuntimeConfig', () => runtimeConfig)

  handler = (await import('../../server/middleware/canonical-origin')).default
})

beforeEach(() => {
  process.env.NODE_ENV = 'production'
  runtimeConfig.auth.origin = ''
})

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
})

afterAll(() => {
  for (const name of globalNames) {
    const original = originalGlobals.get(name)
    if (!original) continue
    if (original.hadOwnProperty) Reflect.set(globalThis, name, original.value)
    else Reflect.deleteProperty(globalThis, name)
  }
})

describe('canonical origin middleware', () => {
  it('keeps a public production HTML request on its remote host when AUTH_ORIGIN is localhost', () => {
    runtimeConfig.auth.origin = 'http://localhost:3200'

    expect(handler(createPageRequest('https://public.example.test/docs/getting-started'))).toBeUndefined()
  })

  it('redirects a public production HTML request to a configured non-local canonical origin', () => {
    runtimeConfig.auth.origin = 'https://nexus.example.test'

    expect(handler(createPageRequest('https://public.example.test/docs/getting-started?locale=en'))).toEqual({
      location: 'https://nexus.example.test/docs/getting-started?locale=en',
      status: 307,
    })
  })
})
