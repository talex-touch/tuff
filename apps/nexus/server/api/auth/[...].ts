import type { H3Event } from 'h3'
import { defineEventHandler } from 'h3'
import { NuxtAuthHandler } from '#auth'
import { useRuntimeConfig } from '#imports'
import type { Account, AuthOptions, Profile, Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import Credentials from '@auth/core/providers/credentials'
import GitHub from '@auth/core/providers/github'
import Email from '@auth/core/providers/email'
import { createD1Adapter } from '../../utils/authAdapter'
import { consumeLoginToken, getUserByEmail, logLoginAttempt, verifyUserPassword } from '../../utils/authStore'
import { sendEmail } from '../../utils/email'

function getAuthOptions(event: H3Event): AuthOptions {
  const config = useRuntimeConfig()
  const providers = [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        loginToken: { label: 'Login Token', type: 'text' }
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.toString().trim().toLowerCase() ?? ''
        const password = credentials?.password?.toString() ?? ''
        const loginToken = credentials?.loginToken?.toString() ?? ''

        if (loginToken) {
          const user = await consumeLoginToken(event, loginToken)
          if (user) {
            await logLoginAttempt(event, { userId: user.id, deviceId: null, success: true, reason: 'login_token' })
            return { id: user.id, email: user.email, name: user.name, image: user.image }
          }
          await logLoginAttempt(event, { userId: null, deviceId: null, success: false, reason: 'login_token_invalid' })
          return null
        }

        if (!email || !password) {
          await logLoginAttempt(event, { userId: null, deviceId: null, success: false, reason: 'missing_credentials' })
          return null
        }

        const user = await verifyUserPassword(event, email, password)
        if (!user) {
          await logLoginAttempt(event, { userId: null, deviceId: null, success: false, reason: 'invalid_password' })
          return null
        }
        if (!user.emailVerified) {
          await logLoginAttempt(event, { userId: user.id, deviceId: null, success: false, reason: 'email_unverified' })
          return null
        }

        await logLoginAttempt(event, { userId: user.id, deviceId: null, success: true, reason: 'password' })
        return { id: user.id, email: user.email, name: user.name, image: user.image }
      }
    }),
    GitHub({
      clientId: config.auth?.github?.clientId,
      clientSecret: config.auth?.github?.clientSecret,
      allowDangerousEmailAccountLinking: true
    }),
    Email({
      server: config.auth?.email?.server ?? 'smtp://localhost',
      from: config.auth?.email?.from,
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendEmail({
          to: identifier,
          subject: 'Sign in to Tuff',
          html: `<p>Click the link to sign in:</p><p><a href="${url}">${url}</a></p>`
        })
      }
    })
  ] as unknown as AuthOptions['providers']

  return {
    secret: config.auth?.secret,
    session: { strategy: 'jwt' },
    adapter: createD1Adapter(event) as AuthOptions['adapter'],
    providers,
    callbacks: {
      async signIn({ user, account, profile }: { user: User, account: Account | null, profile?: Profile | undefined }) {
        if (!account)
          return false
        if (account.provider === 'github') {
          const email = user?.email ?? (profile as any)?.email
          if (!email)
            return false
          const existing = await getUserByEmail(event, email)
          if (!existing)
            return false
          return true
        }
        if (account.provider === 'email') {
          const email = user?.email
          if (!email)
            return false
          const existing = await getUserByEmail(event, email)
          return Boolean(existing)
        }
        return true
      },
      async jwt({ token, user }: { token: JWT, user?: User | null }) {
        if (user) {
          token.userId = (user as { id?: string }).id
        }
        return token
      },
      async session({ session, token }: { session: Session, token: JWT }) {
        if (session.user) {
          (session.user as { id?: string }).id = token.userId as string
        }
        return session
      }
    }
  }
}

export default defineEventHandler((event) => {
  const handler = NuxtAuthHandler(getAuthOptions(event))
  return handler(event)
})
