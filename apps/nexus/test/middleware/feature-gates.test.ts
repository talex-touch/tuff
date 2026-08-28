import type { H3Event } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

type Middleware = (event: H3Event) => void

const RISK_HANDLER_PATH = '/api/admin/risk/mode.override'

let handler: Middleware
let hadDefineEventHandler = false
let originalDefineEventHandler: unknown

function setRiskControl(enabled: boolean) {
  ;(globalThis as any).__NUXT_TEST_RUNTIME_CONFIG__ = {
    riskControl: { enabled },
    public: { riskControl: { enabled } },
  }
}

function createEvent(path: string): H3Event {
  // The middleware reads the request target through `event.path` with
  // `event.node.req.url` as the fallback; both carry the raw request line.
  return { path, node: { req: { url: path } } } as unknown as H3Event
}

function gateOf(path: string): 'blocked' | 'allowed' {
  try {
    handler(createEvent(path))
    return 'allowed'
  }
  catch (error: any) {
    if (error?.statusCode === 404 && error?.statusMessage === 'Feature not found.')
      return 'blocked'
    throw error
  }
}

beforeAll(async () => {
  hadDefineEventHandler = Object.hasOwn(globalThis, 'defineEventHandler')
  originalDefineEventHandler = (globalThis as any).defineEventHandler
  ;(globalThis as any).defineEventHandler = (callback: Middleware) => callback
  handler = (await import('../../server/middleware/feature-gates')).default as unknown as Middleware
})

afterAll(() => {
  if (hadDefineEventHandler)
    (globalThis as any).defineEventHandler = originalDefineEventHandler
  else
    delete (globalThis as any).defineEventHandler
  delete (globalThis as any).__NUXT_TEST_RUNTIME_CONFIG__
})

beforeEach(() => {
  setRiskControl(false)
})

describe('feature-gates middleware', () => {
  describe('positive control', () => {
    it('blocks the canonical risk path while risk control is disabled', () => {
      expect(gateOf(RISK_HANDLER_PATH)).toBe('blocked')
    })

    it('allows the canonical risk path once risk control is enabled', () => {
      setRiskControl(true)
      expect(gateOf(RISK_HANDLER_PATH)).toBe('allowed')
    })

    it('never blocks a non-risk admin path', () => {
      expect(gateOf('/api/admin/audits')).toBe('allowed')
      expect(gateOf('/api/admin/users')).toBe('allowed')
    })

    it('ignores non-API requests entirely', () => {
      expect(gateOf('/dashboard/admin/risk')).toBe('allowed')
    })

    it('carries a machine-readable code so clients need not match the message', () => {
      // A missing record answers 404 too, and the only discriminator used to be
      // the English wording of statusMessage.
      expect(() => handler(createEvent(RISK_HANDLER_PATH))).toThrow(
        expect.objectContaining({
          statusCode: 404,
          data: { code: 'NEXUS_FEATURE_DISABLED' },
        }) as unknown as Error,
      )
    })
  })

  describe('percent-encoded request targets', () => {
    // Nitro routes on the decoded path but `event.path` stays raw, so a prefix
    // test against the raw value reads these as unrelated paths while the
    // request still reaches the risk handler. Verified against the dev server:
    // `/api/admin/%72isk/mode.override` returns the handler's own 403, not 404.
    it.each([
      ['/%61pi/admin/risk/mode.override'],
      ['/api/%61dmin/risk/mode.override'],
      ['/api/admin/%72isk/mode.override'],
      ['/api/admin/risk/%6dode.override'],
      ['/api/admin/%65mergency/init'],
      ['/api/admin/oob/%72isk/mode.override'],
      ['/api/admin/telemetry/%69p-blocks'],
      ['/api/dashboard/intelligence/%69p-bans'],
    ])('blocks %s', (path) => {
      expect(gateOf(path)).toBe('blocked')
    })
  })

  describe('structural path variants', () => {
    it.each([
      ['/api/admin/risk/mode.override/'],
      ['/api/admin//risk/mode.override'],
      ['/api/admin/./risk/mode.override'],
      ['/api/admin/audits/../risk/mode.override'],
      ['/api//admin/risk/mode.override'],
      [`${RISK_HANDLER_PATH}?reason=x`],
    ])('blocks %s', (path) => {
      expect(gateOf(path)).toBe('blocked')
    })
  })

  describe('malformed input', () => {
    it('does not surface a decoding failure as a 500', () => {
      // decodeURIComponent throws URIError on a dangling escape; the gate must
      // still answer with its own decision rather than crashing the request.
      expect(() => gateOf('/api/%zz/risk/mode.override')).not.toThrow(URIError)
      expect(gateOf('/api/admin/risk/%zz')).toBe('blocked')
    })
  })
})
