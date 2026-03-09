import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const tuffexSourceEntry = resolve(workspaceRoot, 'packages/tuffex/packages/components/src/index.ts')
const tuffexStyleEntry = resolve(workspaceRoot, 'packages/tuffex/packages/components/style/index.scss')
const tuffexUtilsEntry = resolve(workspaceRoot, 'packages/tuffex/packages/utils/index.ts')
const useWorkspaceSource = true
const isDev = process.env.NODE_ENV !== 'production'
const DEFAULT_NEXUS_ORIGIN = isDev ? 'http://127.0.0.1:3200' : 'https://tuff.tagzxia.com'
const useCloudflareDev = isDev && (
  process.env.NUXT_USE_CLOUDFLARE_DEV === 'true'
  || process.env.NITRO_PRESET === 'cloudflare-pages'
)

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        return trimmed
      }
    }
  }
  return undefined
}

function envString(...keys: string[]): string {
  const values = keys.map(key => process.env[key])
  return firstDefined(...values) || ''
}

export default defineNuxtConfig({
  devtools: { enabled: true },
  compatibilityDate: '2026-03-08',
  css: ['@talex-touch/tuffex/style.css'],
  build: {
    transpile: ['@talex-touch/tuffex'],
  },
  typescript: {
    strict: true,
    typeCheck: false,
    tsConfig: {
      compilerOptions: {
        paths: {
          '@talex-touch/tuffex': [tuffexSourceEntry],
          '@talex-touch/tuffex/style.css': [tuffexStyleEntry],
          '@talex-touch/tuffex/utils': [tuffexUtilsEntry],
        },
      },
    },
  },
  vite: {
    resolve: {
      alias: [
        ...(useWorkspaceSource
          ? [
              { find: /^@talex-touch\/tuffex$/, replacement: tuffexSourceEntry },
              { find: /^@talex-touch\/tuffex\/style\.css$/, replacement: tuffexStyleEntry },
              { find: /^@talex-touch\/tuffex\/utils$/, replacement: tuffexUtilsEntry },
            ]
          : []),
      ],
    },
    server: {
      fs: {
        allow: [workspaceRoot],
      },
    },
  },
  nitro: {
    preset: isDev && !useCloudflareDev ? 'node-server' : 'cloudflare-pages',
    ...(useCloudflareDev
      ? {
          cloudflareDev: {
            environment: process.env.CLOUDFLARE_DEV_ENVIRONMENT,
            configPath: resolve(workspaceRoot, 'apps/pilot/wrangler.toml'),
            persistDir: resolve(workspaceRoot, '.wrangler/state/v3/pilot'),
          },
        }
      : {}),
  },
  runtimeConfig: {
    pilot: {
      baseUrl: envString('NUXT_PILOT_BASE_URL'),
      apiKey: envString('NUXT_PILOT_API_KEY'),
      nexusOrigin: envString('NUXT_PUBLIC_NEXUS_ORIGIN') || DEFAULT_NEXUS_ORIGIN,
      nexusInternalOrigin: envString('PILOT_NEXUS_INTERNAL_ORIGIN')
        || envString('NUXT_PUBLIC_NEXUS_ORIGIN')
        || DEFAULT_NEXUS_ORIGIN,
      nexusOauthClientId: envString('PILOT_NEXUS_OAUTH_CLIENT_ID'),
      nexusOauthClientSecret: envString('PILOT_NEXUS_OAUTH_CLIENT_SECRET'),
      cookieSecret: envString('PILOT_COOKIE_SECRET'),
      sessionCookieMaxAgeSec: Number(envString('PILOT_SESSION_COOKIE_MAX_AGE_SEC') || 86_400),
    },
    public: {
      pilotTitle: 'Tuff Pilot',
      nexusOrigin: envString('NUXT_PUBLIC_NEXUS_ORIGIN') || DEFAULT_NEXUS_ORIGIN,
    },
  },
})
