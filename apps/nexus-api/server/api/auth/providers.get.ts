import { defineEventHandler } from 'h3'
import { resolveAuthBaseUrl, resolveAuthProviderConfig } from '../../utils/authOAuth'

export default defineEventHandler((event) => {
  const baseUrl = resolveAuthBaseUrl(event)
  const cfg = resolveAuthProviderConfig(event)
  const providers: Record<string, { id: string, name: string, type: string, signinUrl: string, callbackUrl: string }> = {
    credentials: {
      id: 'credentials',
      name: 'Passkey',
      type: 'credentials',
      signinUrl: `${baseUrl}/api/auth/signin/credentials`,
      callbackUrl: `${baseUrl}/api/auth/callback/credentials`,
    },
  }

  if (cfg.github.clientId && cfg.github.clientSecret) {
    providers.github = {
      id: 'github',
      name: 'GitHub',
      type: 'oauth',
      signinUrl: `${baseUrl}/api/auth/signin/github`,
      callbackUrl: `${baseUrl}/api/auth/callback/github`,
    }
  }

  if (cfg.linuxdo.clientId && cfg.linuxdo.clientSecret) {
    providers.linuxdo = {
      id: 'linuxdo',
      name: 'LinuxDO',
      type: 'oauth',
      signinUrl: `${baseUrl}/api/auth/signin/linuxdo`,
      callbackUrl: `${baseUrl}/api/auth/callback/linuxdo`,
    }
  }

  if (cfg.email.from) {
    providers.email = {
      id: 'email',
      name: 'Email',
      type: 'email',
      signinUrl: `${baseUrl}/api/auth/signin/email`,
      callbackUrl: `${baseUrl}/api/auth/callback/email`,
    }
  }

  return providers
})
