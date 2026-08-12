import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Profile } from 'next-auth'
import { describe, expect, it } from 'vitest'
import { EMAIL_VERIFYING_OAUTH_PROVIDERS, oauthEmailProvesMailboxControl, selectVerifiedGitHubEmail } from './oauthEmailTrust'

/**
 * The rule that decides whether an OAuth email may be used to sign in as an account that
 * already exists (#916).
 *
 * LinuxDO's /api/user returns an address with no verification claim attached, and the
 * provider had allowDangerousEmailAccountLinking on, so setting a victim's address at the
 * issuer was enough to be handed their Nexus account.
 */
describe('oauthEmailProvesMailboxControl', () => {
  const profile = (value: unknown): Profile => ({ email_verified: value }) as unknown as Profile

  it('trusts github, whose userinfo hook keeps only issuer-verified addresses', () => {
    expect(oauthEmailProvesMailboxControl('github')).toBe(true)
  })

  it('does not trust linuxdo, which sends no verification claim', () => {
    expect(oauthEmailProvesMailboxControl('linuxdo')).toBe(false)
    expect(oauthEmailProvesMailboxControl('linuxdo', profile(undefined))).toBe(false)
  })

  it('accepts an explicit email_verified claim from any provider', () => {
    // Kept so a provider that does assert verification is not punished for not being github.
    expect(oauthEmailProvesMailboxControl('linuxdo', profile(true))).toBe(true)
  })

  it('rejects the truthy shapes that are not a verification claim', () => {
    // An issuer emitting "false" as a string would otherwise read as verified, which is the
    // classic way a strict-equality check gets loosened into a vulnerability.
    for (const value of ['true', 'false', 1, 0, 'yes', {}, [], null])
      expect(oauthEmailProvesMailboxControl('linuxdo', profile(value)), String(value)).toBe(false)
  })

  it('fails closed for an unknown provider', () => {
    expect(oauthEmailProvesMailboxControl('some-new-idp')).toBe(false)
  })

  it('keeps the trusted set to providers that actually verify', () => {
    // A guard on the allowlist itself: adding an entry here silently re-opens #916 for that
    // provider, so growing it should require editing this assertion too.
    expect([...EMAIL_VERIFYING_OAUTH_PROVIDERS]).toEqual(['github'])
  })
})

/**
 * The other half of the fix lives in provider config, where re-enabling the hole is a
 * one-word edit. Asserted against the source text because the auth route builds its provider
 * list inside a Nuxt request handler and cannot be imported in isolation.
 */
describe('linuxdo provider configuration', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../api/auth/[...].ts', import.meta.url)),
    'utf8',
  )

  function linuxdoBlock(): string {
    const start = source.indexOf('const linuxdoProvider')
    expect(start, 'linuxdo provider block not found — this guard is reading the wrong file').toBeGreaterThan(-1)
    const end = source.indexOf('providers.push(linuxdoProvider', start)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
  }

  it('does not allow dangerous email account linking', () => {
    expect(linuxdoBlock()).toContain('allowDangerousEmailAccountLinking: false')
    expect(linuxdoBlock()).not.toContain('allowDangerousEmailAccountLinking: true')
  })

  it('confirms the guard can see a true value, so the assertion above means something', () => {
    // Positive control. Without it, a block() that silently returned '' would pass the
    // not.toContain above and report a fixed provider forever.
    const github = source.slice(source.indexOf('GitHubProvider({'))
    expect(github).toContain('allowDangerousEmailAccountLinking: true')
  })
})

/**
 * Which address GitHub's /user/emails contributes (#917).
 *
 * The selection had a last-resort branch that took any address when no verified one matched.
 * GitHub returns addresses a user has merely *added*, so that branch could yield one the
 * signer never proved they own — and oauthEmailProvesMailboxControl above trusts 'github'
 * unconditionally on the premise that this selection is verified-only.
 */
describe('selectVerifiedGitHubEmail', () => {
  const entry = (email: string, verified: boolean, primary = false) => ({ email, verified, primary })

  it('prefers the verified primary address', () => {
    expect(selectVerifiedGitHubEmail([
      entry('other@example.com', true),
      entry('me@example.com', true, true),
    ])).toBe('me@example.com')
  })

  it('takes a verified non-primary when no verified primary exists', () => {
    expect(selectVerifiedGitHubEmail([
      entry('unverified@example.com', false, true),
      entry('me@example.com', true),
    ])).toBe('me@example.com')
  })

  it('returns nothing when the only addresses are unverified', () => {
    // The regression. This used to return victim@example.com, which then matched an existing
    // Nexus account and linked the attacker's GitHub identity to it.
    expect(selectVerifiedGitHubEmail([
      entry('victim@example.com', false, true),
      entry('attacker@example.com', false),
    ])).toBeUndefined()
  })

  it('never prefers an unverified primary over a verified non-primary', () => {
    expect(selectVerifiedGitHubEmail([
      entry('victim@example.com', false, true),
      entry('attacker@example.com', true),
    ])).toBe('attacker@example.com')
  })

  it('treats a non-boolean verified value as unverified', () => {
    for (const value of ['true', 1, 'yes', {}])
      expect(selectVerifiedGitHubEmail([{ email: 'x@example.com', verified: value, primary: true }]), String(value)).toBeUndefined()
  })

  it('handles the shapes a failed API call can produce', () => {
    for (const value of [[], null, undefined, {}, 'nope'])
      expect(selectVerifiedGitHubEmail(value)).toBeUndefined()
    expect(selectVerifiedGitHubEmail([null, { email: '' , verified: true }, { verified: true }])).toBeUndefined()
  })
})
