export const EMAIL_VERIFYING_OAUTH_PROVIDERS = new Set(['github'])

export function oauthEmailProvesMailboxControl(provider: string, profile?: Record<string, unknown> | null): boolean {
  if (EMAIL_VERIFYING_OAUTH_PROVIDERS.has(provider))
    return true
  return profile?.email_verified === true
}

export function selectVerifiedGitHubEmail(emails: unknown): string | undefined {
  if (!Array.isArray(emails))
    return undefined

  const usable = (item: unknown): item is { email: string, verified: true, primary?: unknown } => {
    if (!item || typeof item !== 'object')
      return false
    const record = item as { email?: unknown, verified?: unknown }
    return typeof record.email === 'string' && record.email.length > 0 && record.verified === true
  }

  const found = emails.find(item => usable(item) && (item as { primary?: unknown }).primary === true)
    ?? emails.find(usable)

  return usable(found) ? found.email : undefined
}
