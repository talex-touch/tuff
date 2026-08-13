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

    // Whitespace-tolerant: the handler now spreads sendEmail's arguments over
    // several lines, so the literal '}, tryCreateAuthEvent())' no longer
    // appears even though the event is still passed as the second argument.
    // The three '}, event)' checks above are exposed to the same reformatting.
    expect(readAuthHandler('[...].ts')).toMatch(/\}\s*,\s*tryCreateAuthEvent\(\)\s*,?\s*\)/)
  })

  it('tags auth email actions for notification channel routing', () => {
    expect(readAuthHandler('register.post.ts')).toContain("action: 'auth.email.verify'")
    expect(readAuthHandler('bind-email.post.ts')).toContain("action: 'auth.email.bind.verify'")
    expect(readAuthHandler('password/forgot.post.ts')).toContain("action: 'auth.password.reset'")
    expect(readAuthHandler('[...].ts')).toContain("action: 'auth.email.magic_link'")
  })
})
