import type { H3Event } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const requestUrls = new WeakMap<object, URL>()
const globalNames = ['defineEventHandler', 'getRequestURL', 'getQuery', 'createError', 'sendRedirect'] as const
const originalGlobals = new Map<string, { hadOwnProperty: boolean, value: unknown }>()

let handler: typeof import('../../server/middleware/content-runtime-guard').default

function installGlobal(name: string, value: unknown) {
  originalGlobals.set(name, {
    hadOwnProperty: Object.hasOwn(globalThis, name),
    value: Reflect.get(globalThis, name),
  })
  Reflect.set(globalThis, name, value)
}

function createRequest(url: string): H3Event {
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
  installGlobal('getQuery', (event: object) => {
    const url = requestUrls.get(event)
    return Object.fromEntries(url?.searchParams.entries() ?? [])
  })
  installGlobal('createError', (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
  installGlobal('sendRedirect', (_event: object, location: string, status: number) => ({ location, status }))
  handler = (await import('../../server/middleware/content-runtime-guard')).default
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

describe('content-runtime-guard production prefix blocking (N2)', () => {
  it.each([
    '/__nuxt_content/docs/sql_dump.txt',
    '/__nuxt_content/app/query',
    '/api/docs/page',
    '/api/docs/page/en/body/guide/start.json',
    '/api/docs/navigation',
    '/api/docs/navigation/en/all',
    '/api/docs/search',
    '/api/docs/search/zh',
    '/llms.txt',
  ])('blocks %s with 404 so no request can trigger D1 queryCollection rebuild', (path) => {
    expect(() => handler(createRequest(path))).toThrowError(expect.objectContaining({ statusCode: 404 }))
  })

  it.each([
    '/api/docs/sidebar-components',
    '/api/docs/sidebar-components/en',
    '/api/docs/component-sync',
    '/api/docs/component-sync/status',
  ])('blocks evicted component endpoint %s with 410 Gone', (path) => {
    expect(() => handler(createRequest(path))).toThrowError(expect.objectContaining({ statusCode: 410 }))
  })

  it.each([
    '/api/docs/view',
    '/api/docs/feedback',
    '/api/docs/comments',
    '/api/docs/engagement',
    '/api/updates',
  ])('does not block live Worker API route %s', (path) => {
    expect(handler(createRequest(path))).toBeUndefined()
  })

  it('keeps legacy /api/content/policy query redirect intact', () => {
    expect(handler(createRequest('/api/content/policy?name=privacy&locale=zh'))).toEqual({
      location: '/api/content/policy/privacy/zh',
      status: 307,
    })
  })
})
