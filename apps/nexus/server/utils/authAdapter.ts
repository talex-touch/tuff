import type { H3Event } from 'h3'
import { createVerificationToken, getUserByAccount, getUserByEmail, getUserById, linkAccount, updateUserProfile, useVerificationToken } from './authStore'

function toAdapterUser(user: { id: string, email: string, name: string | null, image: string | null, emailVerified: string | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    emailVerified: user.emailVerified ? new Date(user.emailVerified) : null
  }
}

export function createD1Adapter(event: H3Event) {
  return {
    async createUser(data: any) {
      const existing = await getUserByEmail(event, data.email)
      if (!existing) {
        throw new Error('Email signup is disabled for OAuth providers.')
      }
      return toAdapterUser(existing)
    },
    async getUser(id: string) {
      const user = await getUserById(event, id)
      return user ? toAdapterUser(user) : null
    },
    async getUserByEmail(email: string) {
      const user = await getUserByEmail(event, email)
      return user ? toAdapterUser(user) : null
    },
    async getUserByAccount({ provider, providerAccountId }: { provider: string, providerAccountId: string }) {
      const user = await getUserByAccount(event, provider, providerAccountId)
      return user ? toAdapterUser(user) : null
    },
    async updateUser(data: any) {
      const updated = await updateUserProfile(event, data.id, { name: data.name ?? null, image: data.image ?? null })
      return updated ? toAdapterUser(updated) : null
    },
    async linkAccount(account: any) {
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
      await createVerificationToken(
        event,
        token.identifier,
        Math.max(0, token.expires.getTime() - Date.now()),
        token.token
      )
      return token
    },
    async useVerificationToken({ identifier, token }: { identifier: string, token: string }) {
      return useVerificationToken(event, identifier, token)
    }
  } as any
}
