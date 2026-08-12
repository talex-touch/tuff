import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocToken, verifyDocToken } from '../docAnalyticsStore'

// useRuntimeConfig is a Nuxt auto-import, so it is a global here rather than a module.
// Stubbing it as a module left it undefined, and the fail-closed cases then "passed" on a
// ReferenceError instead of on the credential policy — a false green worth not repeating.
vi.stubGlobal('useRuntimeConfig', () => ({}))


/** A Pages-shaped event: secrets arrive as bindings, never through process.env. */
function eventWithBindings(env: Record<string, unknown>): H3Event {
  return { context: { cloudflare: { env } } } as unknown as H3Event
}

const payload = { sid: 's', path: '/docs/x', cid: 'c', src: 'docs_page' as const, rl: 0 }

describe('doc token signing secret', () => {
  beforeEach(() => {
    delete process.env.NUXT_DOC_TOKEN_SECRET
    delete process.env.AUTH_SECRET
  })

  it('signs with the binding when Cloudflare supplies one', () => {
    const event = eventWithBindings({ NUXT_DOC_TOKEN_SECRET: 'a'.repeat(40) })
    const token = createDocToken(event, payload)

    expect(verifyDocToken(event, token)).toMatchObject({ path: '/docs/x' })
  })

  it('does not accept a token signed under a different binding', () => {
    const minted = createDocToken(eventWithBindings({ NUXT_DOC_TOKEN_SECRET: 'a'.repeat(40) }), payload)
    const other = eventWithBindings({ NUXT_DOC_TOKEN_SECRET: 'b'.repeat(40) })

    expect(verifyDocToken(other, minted)).toBeNull()
  })

  it('fails closed on a deployed runtime with no secret, instead of using a constant', () => {
    // The defect: bindings present but no secret among them meant selectRuntimeCredential
    // returned undefined, every process.env fallback was skipped by design, and the old code
    // signed with a constant published in this repository (#920).
    const event = eventWithBindings({ SOMETHING_ELSE: 'x' })

    expect(() => createDocToken(event, payload)).toThrow(/NUXT_DOC_TOKEN_SECRET/)
  })

  it('rejects a secret that is too short rather than silently accepting it', () => {
    const event = eventWithBindings({ NUXT_DOC_TOKEN_SECRET: 'short' })

    expect(() => createDocToken(event, payload)).toThrow(/NUXT_DOC_TOKEN_SECRET/)
  })
})
