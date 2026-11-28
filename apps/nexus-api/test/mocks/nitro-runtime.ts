import type { H3Event } from 'h3'

let mockConfig: Record<string, any> = {
  auth: {
    secret: 'test-auth-secret-minimum-16-chars',
    origin: 'http://localhost:3201',
    github: { clientId: '', clientSecret: '' },
    linuxdo: { clientId: '', clientSecret: '', issuer: 'https://connect.linux.do' },
    email: { from: 'tuff@tagzxia.com', resendApiKey: '', resendApiUrl: 'https://api.resend.com/emails' },
  },
  exchangeRate: {
    apiKey: 'test-fx-key',
    baseUrl: 'https://v6.exchangerate-api.com/v6',
    ttlMs: 8 * 60 * 60 * 1000,
    timeoutMs: 10000,
    historyRetentionDays: 0,
    storeRateRows: true,
  },
  providerRegistry: {
    secureStoreKey: 'test-provider-secure-store-key-32chars',
  },
  releaseDownload: {
    secret: 'test-release-download-secret-16chars',
    fallbackSecret: 'test-auth-secret-minimum-16-chars',
    signedTtlSeconds: 900,
    allowUnsignedFallback: true,
  },
  appAuthJwtSecret: 'test-app-auth-jwt-secret-16chars',
  adminBootstrap: {
    secret: '',
  },
  public: {
    siteUrl: 'https://tuff.tagzxia.com',
  },
}

const memoryKv = new Map<string, unknown>()

export function __setMockRuntimeConfig(next: Record<string, any>) {
  mockConfig = next
}

export function __clearMockStorage() {
  memoryKv.clear()
}

export function useRuntimeConfig(_event?: H3Event): Record<string, any> {
  return mockConfig
}

export function useStorage(_base?: string) {
  return {
    async getItem<T = unknown>(key: string): Promise<T | null> {
      return (memoryKv.get(key) as T | undefined) ?? null
    },
    async setItem(key: string, value: unknown): Promise<void> {
      memoryKv.set(key, value)
    },
    async removeItem(key: string): Promise<void> {
      memoryKv.delete(key)
    },
  }
}

export function defineNitroPlugin<T>(plugin: T): T {
  return plugin
}

export function defineTask<T>(task: T): T {
  return task
}
