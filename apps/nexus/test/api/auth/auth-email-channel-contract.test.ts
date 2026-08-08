import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readAuthHandler(relativePath: string): string {
  return readFileSync(new URL(`../../../server/api/auth/${relativePath}`, import.meta.url), 'utf8')
}

describe('auth email notification channel contract', () => {
  it('passes the request event into password and verification emails', () => {
    const handlers = [
      readAuthHandler('register.post.ts'),
      readAuthHandler('bind-email.post.ts'),
      readAuthHandler('password/forgot.post.ts'),
    ]

    for (const handler of handlers)
      expect(handler).toContain('}, event)')

    // The magic-link call was reformatted across lines. What this test is protecting is
    // that the auth event is still passed as sendEmail's second argument -- that is what
    // notification channel routing reads -- not that it fits on one line.
    expect(readAuthHandler('[...].ts')).toMatch(/\},\s*tryCreateAuthEvent\(\),?\s*\)/)
  })

  it('tags auth email actions for notification channel routing', () => {
    expect(readAuthHandler('register.post.ts')).toContain("action: 'auth.email.verify'")
    expect(readAuthHandler('bind-email.post.ts')).toContain("action: 'auth.email.bind.verify'")
    expect(readAuthHandler('password/forgot.post.ts')).toContain("action: 'auth.password.reset'")
    expect(readAuthHandler('[...].ts')).toContain("action: 'auth.email.magic_link'")
  })
})
