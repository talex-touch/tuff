import type { H3Event } from 'h3'
import { defineEventHandler, setCookie, setResponseStatus } from 'h3'
import { NuxtAuthHandler } from '#auth'
import { useRuntimeConfig } from '#imports'
import type { OAuthConfig } from '@auth/core/providers/oauth'
import Credentials from '@auth/core/providers/credentials'
import GitHub from '@auth/core/providers/github'
import Email from '@auth/core/providers/email'
import { createD1Adapter } from '../../utils/authAdapter'
import { consumeLoginToken, getUserByAccount, getUserByEmail, logLoginAttempt, verifyUserPassword } from '../../utils/authStore'
import { sendEmail } from '../../utils/email'

function getAuthOptions(event: H3Event) {
  const config = useRuntimeConfig()
  const linuxdoIssuer = config.auth?.linuxdo?.issuer || 'https://connect.linux.do'
  const linuxdoClientId = config.auth?.linuxdo?.clientId
  const linuxdoClientSecret = config.auth?.linuxdo?.clientSecret
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
        await logLoginAttempt(event, { userId: user.id, deviceId: null, success: true, reason: 'password' })
        return { id: user.id, email: user.email, name: user.name, image: user.image }
      }
    })
  ]

  const githubClientId = config.auth?.github?.clientId
  const githubClientSecret = config.auth?.github?.clientSecret
  if (githubClientId && githubClientSecret) {
    providers.push(GitHub({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      allowDangerousEmailAccountLinking: true
    }))
  }

  if (linuxdoClientId && linuxdoClientSecret) {
    const linuxdoProvider: OAuthConfig<Record<string, any>> = {
      id: 'linuxdo',
      name: 'LinuxDO',
      type: 'oauth',
      clientId: linuxdoClientId,
      clientSecret: linuxdoClientSecret,
      authorization: { url: `${linuxdoIssuer}/oauth2/authorize` },
      token: { url: `${linuxdoIssuer}/oauth2/token` },
      userinfo: { url: `${linuxdoIssuer}/api/user` },
      profile(profile: Record<string, any>) {
        const id = profile.sub ?? profile.id ?? profile.user_id ?? profile.uid
        const avatarTemplate = typeof profile.avatar_template === 'string'
          ? profile.avatar_template.replace('{size}', '128')
          : null
        const image = profile.avatar_url ?? avatarTemplate ?? profile.avatar ?? profile.picture ?? null
        return {
          id: id ? String(id) : '',
          name: profile.name ?? profile.username ?? null,
          email: profile.email ?? null,
          image,
        }
      }
    }
    providers.push(linuxdoProvider as any)
  }

  const emailServer = config.auth?.email?.server
  const emailFrom = config.auth?.email?.from
  if (emailServer && emailFrom) {
    providers.push(Email({
      server: emailServer,
      from: emailFrom,
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendEmail({
          to: identifier,
          subject: 'Sign in to Tuff',
          html: `<p>Click the link to sign in:</p><p><a href="${url}">${url}</a></p>`
        })
      }
    }))
  }
  return {
    trustHost: true,
    secret: config.auth?.secret,
    session: { strategy: 'jwt' },
    adapter: createD1Adapter(event),
    pages: {
      signIn: '/sign-in',
      error: '/sign-in',
      verifyRequest: '/verify-waiting',
    },
    providers,
    callbacks: {
      async signIn({ user, account, profile }) {
        if (!account)
          return false
        if (account.type === 'oauth') {
          if (account.provider && account.providerAccountId) {
            const existingByAccount = await getUserByAccount(event, account.provider, account.providerAccountId)
            if (existingByAccount)
              return existingByAccount.status === 'active'
          }
          const email = user?.email ?? (profile as any)?.email
          if (!email)
            return true
          const existing = await getUserByEmail(event, email)
          if (!existing)
            return true
          return existing.status === 'active'
        }
        if (account.provider === 'email') {
          const email = user?.email
          if (!email)
            return false
          const existing = await getUserByEmail(event, email)
          return Boolean(existing && existing.status === 'active')
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

const SESSION_ERROR_COOKIE = 'nexus_auth_error'
const SESSION_ERROR_VALUE = 'jwt_session_error'
const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'authjs.session-token',
  '__Secure-authjs.session-token',
]

function isJwtSessionError(error: unknown) {
  if (error instanceof Error) {
    return error.message.includes('JWT_SESSION_ERROR')
      || error.message.includes('decryption operation failed')
  }
  return String(error).includes('JWT_SESSION_ERROR')
    || String(error).includes('decryption operation failed')
}

function isSessionRequest(event: H3Event) {
  const url = event.path || event.node.req.url || ''
  return url.includes('/api/auth/session')
}

function clearAuthCookies(event: H3Event) {
  SESSION_COOKIE_NAMES.forEach((name) => {
    const secure = name.startsWith('__Secure-') || name.startsWith('__Host-')
    setCookie(event, name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure,
    })
  })
}

function markSessionError(event: H3Event) {
  setCookie(event, SESSION_ERROR_COOKIE, SESSION_ERROR_VALUE, {
    path: '/',
    maxAge: 60,
    sameSite: 'lax',
  })
}

export default defineEventHandler(async (event) => {
  const authHandler = NuxtAuthHandler(getAuthOptions(event))
  try {
    return await authHandler(event)
  }
  catch (error) {
    if (isJwtSessionError(error) && isSessionRequest(event)) {
      clearAuthCookies(event)
      markSessionError(event)
      setResponseStatus(event, 401)
      return { error: SESSION_ERROR_VALUE }
    }
    throw error
  }
})
