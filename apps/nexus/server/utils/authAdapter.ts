import type { H3Event } from 'h3'
import { ensurePersonalTeam } from './creditsStore'
import { createUser, createVerificationToken, getUserByAccount, getUserByEmail, getUserById, isUserActive, linkAccount, updateUserProfile, useVerificationToken } from './authStore'

function toAdapterUser(user: { id: string, email: string, name: string | null, image: string | null, emailVerified: string | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    emailVerified: user.emailVerified ? new Date(user.emailVerified) : null
  }
}

export function createD1Adapter(eventOrGetter: H3Event | (() => H3Event)) {
  const resolveEvent = typeof eventOrGetter === 'function'
    ? eventOrGetter
    : () => eventOrGetter

  return {
    async createUser(data: any) {
      const event = resolveEvent()
      const rawEmail = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
      const hasEmail = rawEmail.length > 0
      const email = hasEmail ? rawEmail : `missing+${crypto.randomUUID()}@tuff.local`
      if (hasEmail) {
        const existing = await getUserByEmail(event, email)
        if (existing) {
          if (!isUserActive(existing)) {
            throw new Error('Account is disabled.')
          }
          return toAdapterUser(existing)
        }
      }
      const emailVerified = hasEmail
        ? (data.emailVerified instanceof Date ? data.emailVerified.toISOString() : new Date().toISOString())
        : null
      const user = await createUser(event, {
        email,
        name: typeof data.name === 'string' ? data.name : null,
        image: typeof data.image === 'string' ? data.image : null,
        emailVerified,
        emailState: hasEmail ? 'verified' : 'missing',
      })
      await ensurePersonalTeam(event, user.id)
      return toAdapterUser(user)
    },
    async getUser(id: string) {
      const event = resolveEvent()
      const user = await getUserById(event, id)
      return user ? toAdapterUser(user) : null
    },
    async getUserByEmail(email: string) {
      const event = resolveEvent()
      const user = await getUserByEmail(event, email)
      return user ? toAdapterUser(user) : null
    },
    async getUserByAccount({ provider, providerAccountId }: { provider: string, providerAccountId: string }) {
      const event = resolveEvent()
      const user = await getUserByAccount(event, provider, providerAccountId)
      return user ? toAdapterUser(user) : null
    },
    async updateUser(data: any) {
      const event = resolveEvent()
      const updated = await updateUserProfile(event, data.id, { name: data.name ?? null, image: data.image ?? null })
      return updated ? toAdapterUser(updated) : null
    },
    async linkAccount(account: any) {
      const event = resolveEvent()
      await linkAccount(event, account.userId, account.provider, account.providerAccountId)
      return account
    },
    async unlinkAccount() {
      return null
    },
    async createSession() {
      return null
    },
    async getSessionAndUser() {
      return null
    },
    async updateSession() {
      return null
    },
    async deleteSession() {
      return null
    },
    async createVerificationToken(token: any) {
      const event = resolveEvent()
      await createVerificationToken(
        event,
        token.identifier,
        Math.max(0, token.expires.getTime() - Date.now()),
        token.token
      )
      return token
    },
    async useVerificationToken({ identifier, token }: { identifier: string, token: string }) {
      const event = resolveEvent()
      return useVerificationToken(event, identifier, token)
    }
  } as any
}
