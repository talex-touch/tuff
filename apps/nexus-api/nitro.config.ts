import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineNitroConfig } from 'nitropack/config'

const currentDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(currentDir, '../..')
const requireFromConfig = createRequire(import.meta.url)

function resolveOptionalPackagePath(specifier: string, subpath: string): string {
  const searchPaths = [
    currentDir,
    workspaceRoot,
  ]
  const resolvedPkg = requireFromConfig.resolve(specifier, { paths: searchPaths })
  return resolve(dirname(resolvedPkg), subpath)
}

const hkdfCompatEntry = resolveOptionalPackagePath('@panva/hkdf/package.json', 'dist/node/cjs/index.js')
const tuffBusinessSourceEntry = resolve(workspaceRoot, 'packages/tuff-business/src/index.ts')
const isDev = process.env.NODE_ENV !== 'production'
const authSecret = process.env.AUTH_SECRET || (isDev ? 'tuff-dev-secret' : undefined)

export default defineNitroConfig({
  srcDir: 'server',
  compatibilityDate: '2024-09-23',
  preset: process.env.NITRO_PRESET || 'cloudflare-module',
  minify: process.env.NEXUS_API_DISABLE_MINIFY !== 'true',
  sourceMap: process.env.NEXUS_API_SOURCEMAP === 'true',

  experimental: {
    tasks: true,
  },

  scheduledTasks: {
    '0 */8 * * *': ['exchange:refresh'],
  },

  imports: {
    dirsScanOptions: {
      fileFilter(file) {
        const normalized = file.replace(/\\/g, '/')
        return !normalized.endsWith('/server/utils/telemetryRetentionCore.ts')
          && !normalized.endsWith('.test.ts')
      },
    },
  },

  alias: {
    '@panva/hkdf': hkdfCompatEntry,
    '@talex-touch/tuff-business': tuffBusinessSourceEntry,
    '#shared': resolve(currentDir, 'shared'),
  },

  esbuild: {
    options: {
      target: 'esnext',
    },
  },

  runtimeConfig: {
    auth: {
      secret: authSecret,
      origin: process.env.AUTH_ORIGIN,
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
      linuxdo: {
        clientId: process.env.LINUXDO_CLIENT_ID,
        clientSecret: process.env.LINUXDO_CLIENT_SECRET,
        issuer: process.env.LINUXDO_ISSUER || 'https://connect.linux.do',
      },
      email: {
        from: process.env.AUTH_EMAIL_FROM,
        resendApiKey: process.env.RESEND_API_KEY,
        resendApiUrl: process.env.RESEND_API_URL || 'https://api.resend.com/emails',
      },
    },
    exchangeRate: {
      apiKey: process.env.EXCHANGE_RATE_API_KEY,
      baseUrl: process.env.EXCHANGE_RATE_BASE_URL || 'https://v6.exchangerate-api.com/v6',
      ttlMs: Number(process.env.EXCHANGE_RATE_TTL_MS || 8 * 60 * 60 * 1000),
      timeoutMs: Number(process.env.EXCHANGE_RATE_TIMEOUT_MS || 10000),
      historyRetentionDays: Number(process.env.EXCHANGE_RATE_HISTORY_RETENTION_DAYS || 0),
      storeRateRows: process.env.EXCHANGE_RATE_STORE_RATE_ROWS !== 'false',
    },
    providerRegistry: {
      secureStoreKey: process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY,
    },
    releaseDownload: {
      secret: process.env.RELEASE_DOWNLOAD_SIGNING_SECRET || '',
      fallbackSecret: authSecret,
      signedTtlSeconds: Number(process.env.RELEASE_DOWNLOAD_SIGNED_TTL_SECONDS || 15 * 60),
      allowUnsignedFallback: process.env.RELEASE_DOWNLOAD_ALLOW_UNSIGNED_FALLBACK !== 'false',
    },
    appAuthJwtSecret: process.env.APP_AUTH_JWT_SECRET,
    adminBootstrap: {
      secret: process.env.ADMINSECRET || process.env.ADMIN_SECRET,
    },
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://tuff.tagzxia.com',
    },
  },
})
