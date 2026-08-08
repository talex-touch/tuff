import type { Profile } from 'next-auth'

/**
 * OAuth providers whose email claim is itself proof that the signer controls the mailbox.
 *
 * Only GitHub qualifies today: its userinfo hook resolves the address through /user/emails
 * and keeps entries the issuer marks `verified === true`. (That selection still has an
 * unverified last-resort branch — tracked separately in #917 — which is why this is a
 * deliberate allowlist rather than "every provider except LinuxDO".)
 */
export const EMAIL_VERIFYING_OAUTH_PROVIDERS = new Set(['github'])

/**
 * Whether an OAuth email may be used to sign in as a **pre-existing** local account.
 *
 * Creating a fresh account from an unverified address is harmless — the address simply
 * becomes that new account's email. Adopting an account that already exists is not: it hands
 * over someone else's identity on the strength of a string the attacker chose. LinuxDO's
 * /api/user carries no verification claim at all, so anyone who set a victim's address at
 * the issuer could sign straight into the victim's Nexus account, admin included (#916).
 */
export function oauthEmailProvesMailboxControl(provider: string, profile?: Profile): boolean {
  if (EMAIL_VERIFYING_OAUTH_PROVIDERS.has(provider)) return true
  // Absent an explicit claim this is false, so a provider that sends no verification signal
  // fails closed rather than being trusted by default. Only a real boolean `true` counts —
  // the string "true", 1 and "1" are all shapes an issuer can emit for an unverified state.
  return (profile as { email_verified?: unknown } | undefined)?.email_verified === true
}
