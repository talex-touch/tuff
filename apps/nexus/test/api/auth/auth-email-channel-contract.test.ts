import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readAuthHandler(relativePath: string): string {
  return readFileSync(new URL(`../../../server/api/auth/${relativePath}`, import.meta.url), 'utf8')
}

describe('auth email notification channel contract', () => {
  it('passes the request event into verification emails', () => {
    expect(readAuthHandler('bind-email.post.ts')).toContain('}, event)')
    expect(readAuthHandler('[...].ts')).toMatch(/\}\s*,\s*tryCreateAuthEvent\(\)\s*,?\s*\)/)
  })

  it('tags auth email actions for notification channel routing', () => {
    expect(readAuthHandler('bind-email.post.ts')).toContain("action: 'auth.email.bind.verify'")
    expect(readAuthHandler('[...].ts')).toContain("action: 'auth.email.magic_link'")
  })
})
