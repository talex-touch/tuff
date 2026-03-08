import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const tuffexSourceEntry = resolve(workspaceRoot, 'packages/tuffex/packages/components/src/index.ts')
const tuffexStyleEntry = resolve(workspaceRoot, 'packages/tuffex/packages/components/style/index.scss')
const tuffexUtilsEntry = resolve(workspaceRoot, 'packages/tuffex/packages/utils/index.ts')
const useWorkspaceSource = true
const isDev = process.env.NODE_ENV !== 'production'
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
            configPath: resolve(workspaceRoot, 'wrangler.toml'),
            persistDir: resolve(workspaceRoot, '.wrangler/state/v3'),
          },
        }
      : {}),
  },
  runtimeConfig: {
    pilot: {
      baseUrl: envString('NUXT_PILOT_BASE_URL'),
      apiKey: envString('NUXT_PILOT_API_KEY'),
    },
    public: {
      pilotTitle: 'Tuff Pilot',
    },
  },
})
