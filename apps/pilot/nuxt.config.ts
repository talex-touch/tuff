import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { pwa } from './app/config/pwa'
import { appDescription, appKeywords, appName } from './app/constants'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const tuffexSourceEntry = resolve(workspaceRoot, 'packages/tuffex/packages/components/src/index.ts')
const tuffexStyleEntry = resolve(workspaceRoot, 'packages/tuffex/packages/components/style/index.scss')
const tuffexUtilsEntry = resolve(workspaceRoot, 'packages/tuffex/packages/utils/index.ts')
const unoResetStyleEntry = resolve(workspaceRoot, 'node_modules/@unocss/reset/tailwind.css')
const refractorLangShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/refractor-lang.ts')
const vueuseComponentsShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/vueuse-components.ts')
const markmapViewShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/markmap-view.ts')
const markmapCommonShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/markmap-common.ts')
const markmapLibShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/markmap-lib.ts')
const useWorkspaceSource = process.env.NUXT_USE_WORKSPACE_SOURCE === 'true'
const isDev = process.env.NODE_ENV !== 'production'
const enableDevtools = process.env.NUXT_DEVTOOLS === 'true'
const DEFAULT_NEXUS_ORIGIN = isDev ? 'http://127.0.0.1:3200' : 'https://tuff.tagzxia.com'
const buildTime = Number(process.env.TUFFPILOT_BUILD_TIME || (isDev ? 0 : Date.now()))
const thisAiVersion = firstDefined(
  process.env.TUFFPILOT_VERSION,
  process.env.VITE_APP_VERSION,
  process.env.GIT_COMMIT_SHA,
  process.env.COMMIT_SHA,
  process.env.npm_package_version,
) || 'dev'
const useCloudflareDev = isDev && (
  process.env.NUXT_USE_CLOUDFLARE_DEV === 'true'
  || process.env.NITRO_PRESET === 'cloudflare-pages'
)
const DEFAULT_PILOT_BASE_URL = firstDefined(
  process.env.NUXT_PUBLIC_ENDS_URL,
  process.env.NUXT_PILOT_BASE_URL,
) || 'https://sub2api-home.tagzxia.com'

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

function envNumber(key: string, fallback: number): number {
  const raw = envString(key)
  if (!raw) {
    return fallback
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: enableDevtools },
  compatibilityDate: '2026-03-08',
  srcDir: 'app/',
  modules: [
    '@element-plus/nuxt',
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',
    '@nuxt/eslint',
    'nuxt-echarts',
    '@nuxtjs/device',
    ['vite-plugin-version-date-mark/nuxt', {
      name: 'TuffPilot',
      ifShortSHA: true,
      ifMeta: true,
      ifLog: true,
      ifGlobal: true,
    }],
  ],
  css: [
    tuffexStyleEntry,
    unoResetStyleEntry,
  ],
  colorMode: {
    classSuffix: '',
  },
  experimental: {
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: false,
  },
  features: {
    inlineStyles: false,
  },
  build: {
    transpile: [
      '@talex-touch/tuffex',
      /^@antv/,
      'gl-matrix',
    ],
  },
  pwa,
  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'keywords', content: appKeywords },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: 'white' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#222222' },
      ],
    },
  },
  typescript: {
    strict: false,
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
    define: {
      __BuildTime__: buildTime,
      __THISAI_VERSION__: JSON.stringify(thisAiVersion),
    },
    optimizeDeps: {
      exclude: [
        '@milkdown/kit',
        '@milkdown/vue',
        '@antv/x6',
        '@antv/x6-vue-shape',
        'mermaid',
      ],
    },
    resolve: {
      alias: [
        ...(useWorkspaceSource
          ? [
              { find: /^@talex-touch\/tuffex$/, replacement: tuffexSourceEntry },
              { find: /^@talex-touch\/tuffex\/style\.css$/, replacement: tuffexStyleEntry },
              { find: /^@talex-touch\/tuffex\/utils$/, replacement: tuffexUtilsEntry },
            ]
          : []),
        { find: /^refractor\/lang\/.+$/, replacement: refractorLangShimEntry },
        { find: /^@vueuse\/components$/, replacement: vueuseComponentsShimEntry },
        { find: /^@milkdown\/kit\/plugin\/prism$/, replacement: '@milkdown/plugin-prism' },
        { find: /^markmap-view$/, replacement: markmapViewShimEntry },
        { find: /^markmap-common$/, replacement: markmapCommonShimEntry },
        { find: /^markmap-lib$/, replacement: markmapLibShimEntry },
      ],
    },
    ...(useWorkspaceSource
      ? {
          server: {
            fs: {
              allow: [workspaceRoot],
            },
          },
        }
      : {}),
  },
  nitro: {
    preset: isDev && !useCloudflareDev ? 'node-server' : 'cloudflare-pages',
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
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
  sourcemap: isDev
    ? {
        server: false,
        client: false,
      }
    : {
        server: true,
        client: 'hidden',
      },
  eslint: {
    config: {
      standalone: false,
    },
  },
  runtimeConfig: {
    pilot: {
      baseUrl: envString('NUXT_PILOT_BASE_URL') || DEFAULT_PILOT_BASE_URL,
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
      appName,
      endsBaseUrl: envString('NUXT_PUBLIC_ENDS_URL')
        || envString('NUXT_PILOT_BASE_URL')
        || DEFAULT_PILOT_BASE_URL,
      nexusOrigin: envString('NUXT_PUBLIC_NEXUS_ORIGIN') || DEFAULT_NEXUS_ORIGIN,
      pilotStreamIdleTimeoutMs: envNumber('NUXT_PUBLIC_PILOT_STREAM_IDLE_TIMEOUT_MS', 45_000),
      pilotStreamMaxDurationMs: envNumber('NUXT_PUBLIC_PILOT_STREAM_MAX_DURATION_MS', 8 * 60_000),
    },
  },
})
