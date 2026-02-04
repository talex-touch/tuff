import type { H3Event } from 'h3'
import { defineEventHandler } from 'h3'
import { NuxtAuthHandler } from '#auth'
import { useRuntimeConfig } from '#imports'
import Credentials from '@auth/core/providers/credentials'
import GitHub from '@auth/core/providers/github'
import Email from '@auth/core/providers/email'
import { createD1Adapter } from '../../utils/authAdapter'
import { consumeLoginToken, getUserByEmail, logLoginAttempt, verifyUserPassword } from '../../utils/authStore'
import { sendEmail } from '../../utils/email'

function getAuthOptions(event: H3Event) {
  const config = useRuntimeConfig()
  return {
    secret: config.auth?.secret,
    session: { strategy: 'jwt' },
    adapter: createD1Adapter(event),
    providers: [
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
        from: config.auth?.email?.from,
        sendVerificationRequest: async ({ identifier, url }) => {
          await sendEmail({
            to: identifier,
            subject: 'Sign in to Tuff',
            html: `<p>Click the link to sign in:</p><p><a href="${url}">${url}</a></p>`
          })
        }
      })
    ],
    callbacks: {
      async signIn({ user, account, profile }) {
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
      async jwt({ token, user }) {
        if (user) {
          token.userId = (user as any).id
        }
        return token
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.userId as string
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

