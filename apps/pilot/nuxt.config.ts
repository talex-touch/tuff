import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { pwa } from './app/config/pwa'
import { appDescription, appKeywords, appName } from './app/constants'
import { applyPilotEnvPrecedence } from './shared/pilot-env-loader'

const pilotRoot = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(pilotRoot, '../..')
const tuffexSourceEntry = resolve(workspaceRoot, 'packages/tuffex/packages/components/src/index.ts')
const tuffexStyleEntry = resolve(workspaceRoot, 'packages/tuffex/packages/components/style/index.scss')
const tuffexUtilsEntry = resolve(workspaceRoot, 'packages/tuffex/packages/utils/index.ts')
const unoResetStyleEntry = resolve(workspaceRoot, 'node_modules/@unocss/reset/tailwind.css')
const refractorLangShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/refractor-lang.ts')
const vueuseComponentsShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/vueuse-components.ts')
const markmapViewShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/markmap-view.ts')
const markmapCommonShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/markmap-common.ts')
const markmapLibShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/markmap-lib.ts')
const sanitizeUrlShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/braintree-sanitize-url.ts')
const cytoscapeCoseBilkentShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/cytoscape-cose-bilkent.ts')
const cytoscapeFcoseShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/cytoscape-fcose.ts')
const pgNativeShimEntry = resolve(workspaceRoot, 'apps/pilot/app/shims/pg-native.cjs')

applyPilotEnvPrecedence()

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
const DEFAULT_PILOT_BASE_URL = '/'
const FORBIDDEN_DEV_PORT = 3000

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

function envBoolean(keys: string[], fallback: boolean): boolean {
  const raw = envString(...keys).toLowerCase()
  if (!raw) {
    return fallback
  }
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
    return true
  }
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false
  }
  return fallback
}

function envNumber(keys: string[], fallback: number, min: number, max: number): number {
  const raw = envString(...keys)
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

function parseCliDevPort(argv: string[]): number | undefined {
  let resolved: number | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--port' || arg === '-p') {
      const next = argv[index + 1]
      const parsed = Number(next)
      if (Number.isFinite(parsed)) {
        resolved = parsed
      }
      continue
    }
    if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length))
      if (Number.isFinite(parsed)) {
        resolved = parsed
      }
    }
  }
  return resolved
}

function assertDevPortGuard() {
  if (!process.argv.includes('dev')) {
    return
  }
  const argv = process.argv.slice(2)
  const cliPort = parseCliDevPort(argv)
  const envPort = Number(envString('NUXT_PORT', 'PORT'))
  const resolvedPort = Number.isFinite(cliPort)
    ? cliPort
    : (Number.isFinite(envPort) ? envPort : 3300)

  if (resolvedPort === FORBIDDEN_DEV_PORT) {
    throw new Error('[pilot] Local dev forbids port 3000. Please use --port 3300 (or any non-3000 port).')
  }
}

assertDevPortGuard()

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
        { find: /^@braintree\/sanitize-url$/, replacement: sanitizeUrlShimEntry },
        { find: /^cytoscape-cose-bilkent$/, replacement: cytoscapeCoseBilkentShimEntry },
        { find: /^cytoscape-fcose$/, replacement: cytoscapeFcoseShimEntry },
        { find: /^markmap-view$/, replacement: markmapViewShimEntry },
        { find: /^markmap-common$/, replacement: markmapCommonShimEntry },
        { find: /^markmap-lib$/, replacement: markmapLibShimEntry },
        { find: /^pg-native$/, replacement: pgNativeShimEntry },
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
    preset: 'node-server',
    alias: {
      'pg-native': pgNativeShimEntry,
    },
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
  },
  sourcemap: {
    server: false,
    client: false,
  },
  eslint: {
    config: {
      standalone: false,
    },
  },
  runtimeConfig: {
    pilot: {
      nexusOrigin: envString('NUXT_PUBLIC_NEXUS_ORIGIN') || DEFAULT_NEXUS_ORIGIN,
      nexusOauthClientId: envString('PILOT_NEXUS_OAUTH_CLIENT_ID'),
      nexusOauthClientSecret: envString('PILOT_NEXUS_OAUTH_CLIENT_SECRET'),
      cookieSecret: envString('PILOT_COOKIE_SECRET'),
    },
    public: {
      pilotTitle: 'Tuff Pilot',
      appName,
      endsBaseUrl: DEFAULT_PILOT_BASE_URL,
      nexusOrigin: envString('NUXT_PUBLIC_NEXUS_ORIGIN') || DEFAULT_NEXUS_ORIGIN,
      pilotStreamIdleTimeoutMs: 45_000,
      pilotStreamMaxDurationMs: 8 * 60_000,
      pilotToolApprovalAutoResume: envBoolean(['NUXT_PUBLIC_PILOT_TOOL_APPROVAL_AUTO_RESUME'], true),
      pilotToolApprovalPollIntervalMs: envNumber(['NUXT_PUBLIC_PILOT_TOOL_APPROVAL_POLL_INTERVAL_MS'], 1_500, 500, 15_000),
      pilotToolApprovalPollTimeoutMs: envNumber(['NUXT_PUBLIC_PILOT_TOOL_APPROVAL_POLL_TIMEOUT_MS'], 10 * 60_000, 5_000, 60 * 60_000),
      pilotEnableLegacyExecutorEventCompat: envBoolean(['NUXT_PUBLIC_PILOT_ENABLE_LEGACY_EXECUTOR_EVENT_COMPAT'], false),
    },
  },
  devServer: {
    port: 3300,
  },
})
