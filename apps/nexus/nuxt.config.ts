import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants/index'
import { remarkMermaid } from './app/utils/remark-mermaid'

loadEnv({ path: '.env' })
loadEnv({ path: `.env.${process.env.NODE_ENV ?? 'development'}` })
loadEnv({ path: '.env.sentry-build-plugin' })
loadEnv({ path: '.env.local', override: true })
loadEnv({ path: `.env.${process.env.NODE_ENV ?? 'development'}.local`, override: true })

const isDev = process.env.NODE_ENV !== 'production'
const useCloudflareDev = isDev && (process.env.NUXT_USE_CLOUDFLARE_DEV === 'true' || process.env.NITRO_PRESET === 'cloudflare-pages')
const useWorkspaceSource = isDev
const currentDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(currentDir, '../..')
const tuffBusinessSourceEntry = resolve(currentDir, '../../packages/tuff-business/src/index.ts')
const tuffexSourceEntry = resolve(currentDir, '../../packages/tuffex/packages/components/src/index.ts')
const tuffexStyleEntry = resolve(currentDir, '../../packages/tuffex/packages/components/style/index.scss')
const tuffexUtilsEntry = resolve(currentDir, '../../packages/tuffex/packages/utils/index.ts')
const hkdfCompatEntry = resolve(workspaceRoot, 'node_modules/@panva/hkdf/dist/node/cjs/index.js')
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const disableSentry = process.env.NUXT_DISABLE_SENTRY === 'true'
const enableSentrySourceMaps = Boolean(sentryAuthToken) && !disableSentry
const disableNitroMinify = process.env.NUXT_DISABLE_NITRO_MINIFY === 'true'
const disableSsr = process.env.NUXT_DISABLE_SSR === 'true'
const disablePrerender = process.env.NUXT_DISABLE_PRERENDER === 'true'
const isProd = process.env.NODE_ENV === 'production'
const ssrEnabled = isProd ? true : !disableSsr
const enablePayloadExtraction = process.env.NUXT_ENABLE_PAYLOAD_EXTRACTION === 'true'
const disableNitroSourceMap = process.env.NUXT_DISABLE_NITRO_SOURCEMAP === 'true'
const authSecret = process.env.AUTH_SECRET || (isDev ? 'tuff-dev-secret' : undefined)

function isEnvFlagEnabled(value?: string) {
  if (!value)
    return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

const watermarkFeatureEnabled = isEnvFlagEnabled(
  process.env.NUXT_PUBLIC_WATERMARK_ENABLED || process.env.NEXUS_EXPERIMENTAL_WATERMARK_ENABLED,
)
const riskControlFeatureEnabled = isEnvFlagEnabled(
  process.env.NUXT_PUBLIC_RISK_CONTROL_ENABLED || process.env.NEXUS_EXPERIMENTAL_RISK_ENABLED,
)

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',
    '@nuxt/eslint',
    '@nuxt/content',
    '@nuxtjs/i18n',
    '@sidebase/nuxt-auth',
    '@sentry/nuxt/module',
    ...(useCloudflareDev ? ['nitro-cloudflare-dev'] : []),
  ],
  ssr: ssrEnabled,

  imports: {
    dirsScanOptions: {
      fileFilter: (file) => !file.replace(/\\/g, '/').endsWith('/server/utils/billing/index.ts'),
    },
  },

  devtools: {
    enabled: false,
  },

  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css' },
      ],
      script: [
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js', defer: true },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: 'white' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#222222' },
      ],
    },
  },

  css: ['@talex-touch/tuffex/style.css', 'vue-sonner/style.css'],

  colorMode: {
    classSuffix: '',
  },

  content: {
    experimental: {
      nativeSqlite: true,
    },
    build: {
      markdown: {
        remarkPlugins: {
          'remark-mermaid': {
            src: resolve(currentDir, './app/utils/remark-mermaid'),
            instance: remarkMermaid,
          },
        },
        highlight: false,
        toc: {
          depth: 4,
          searchDepth: 4,
        },
      },
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
        issuer: process.env.LINUXDO_ISSUER,
      },
      email: {
        from: process.env.AUTH_EMAIL_FROM,
        server: process.env.AUTH_EMAIL_SERVER,
        resendApiKey: process.env.RESEND_API_KEY,
      },
    },
    turnstile: {
      secretKey: process.env.TURNSTILE_SECRETKEY || process.env.TURNSTILE_SECRET_KEY,
    },
    watermark: {
      secretKey: process.env.WATERMARK_SECRET_KEY || process.env.NUXT_WATERMARK_SECRET_KEY,
      enabled: watermarkFeatureEnabled,
    },
    riskControl: {
      enabled: riskControlFeatureEnabled,
    },
    exchangeRate: {
      apiKey: process.env.EXCHANGE_RATE_API_KEY,
      baseUrl: process.env.EXCHANGE_RATE_BASE_URL || 'https://v6.exchangerate-api.com/v6',
      ttlMs: Number(process.env.EXCHANGE_RATE_TTL_MS || 8 * 60 * 60 * 1000),
      timeoutMs: Number(process.env.EXCHANGE_RATE_TIMEOUT_MS || 10000),
      historyRetentionDays: Number(process.env.EXCHANGE_RATE_HISTORY_RETENTION_DAYS || 0),
      storeRateRows: process.env.EXCHANGE_RATE_STORE_RATE_ROWS !== 'false',
    },
    appAuthJwtSecret: process.env.APP_AUTH_JWT_SECRET,
    adminBootstrap: {
      secret: process.env.ADMINSECRET || process.env.ADMIN_SECRET,
    },
    adminControl: {
      breakglassEnabled: process.env.ADMIN_BREAKGLASS_ENABLED !== 'false',
      controlPlaneProtectedEnabled: process.env.ADMIN_CONTROL_PLANE_PROTECTED_ENABLED !== 'false',
      dualControlEnabled: process.env.ADMIN_DUAL_CONTROL_ENABLED !== 'false',
      preserveInExtremeEnabled: process.env.ADMIN_PRESERVE_IN_EXTREME_ENABLED !== 'false',
      emergencyJwtSecret: process.env.ADMIN_EMERGENCY_JWT_SECRET,
      pepper: process.env.ADMIN_CONTROL_PLANE_PEPPER,
      emergencyIssuerVersion: process.env.ADMIN_EMERGENCY_ISSUER_VERSION || 'v1',
      oobAccessClientId: process.env.ADMIN_CF_ACCESS_CLIENT_ID,
      oobAccessClientSecret: process.env.ADMIN_CF_ACCESS_CLIENT_SECRET,
      oobMtlsEnabled: process.env.ADMIN_OOB_MTLS_ENABLED === 'true',
      oobMtlsFingerprints: process.env.ADMIN_OOB_MTLS_FINGERPRINTS || '',
      defaultDefenseMode: process.env.ADMIN_DEFAULT_DEFENSE_MODE || 'NORMAL',
    },
    public: {
      turnstile: {
        siteKey: process.env.TURNSTILE_SITEKEY || process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY,
      },
      docs: {
        asideCardChrome: process.env.NUXT_PUBLIC_DOCS_ASIDE_CARD_CHROME,
      },
      watermark: {
        enabled: watermarkFeatureEnabled,
      },
      riskControl: {
        enabled: riskControlFeatureEnabled,
      },
    },
  },

  build: {
    transpile: [
      '@talex-touch/tuff-business',
      '@talex-touch/utils',
      ...(useWorkspaceSource ? ['@talex-touch/tuffex'] : []),
    ],
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: enablePayloadExtraction,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2024-09-23',

  nitro: {
    minify: !disableNitroMinify,
    sourceMap: !disableNitroSourceMap,
    alias: {
      '@panva/hkdf': hkdfCompatEntry,
    },
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
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    prerender: disablePrerender
      ? {
          crawlLinks: false,
          ignore: ['/**'],
          routes: [],
        }
      : {
          crawlLinks: false,
          routes: ['/'],
          ignore: ['/hi'],
        },
  },

  vite: {
    resolve: {
      alias: [
        { find: /^@panva\/hkdf$/, replacement: hkdfCompatEntry },
        { find: /^@talex-touch\/tuff-business$/, replacement: tuffBusinessSourceEntry },
        { find: /^@talex-touch\/tuffex\/utils$/, replacement: tuffexUtilsEntry },
        ...(useWorkspaceSource
          ? [
              { find: /^@talex-touch\/tuffex$/, replacement: tuffexSourceEntry },
              { find: /^@talex-touch\/tuffex\/style\.css$/, replacement: tuffexStyleEntry },
            ]
          : []),
      ],
    },
    server: {
      fs: {
        allow: [workspaceRoot],
      },
      hmr: {
        overlay: false,
      },
    },
  },

  typescript: {
    tsConfig: {
      compilerOptions: {
        paths: {
          '@talex-touch/tuff-business': [tuffBusinessSourceEntry],
          '@talex-touch/tuffex/utils': [tuffexUtilsEntry],
          ...(useWorkspaceSource
            ? {
                '@talex-touch/tuffex': [tuffexSourceEntry],
                '@talex-touch/tuffex/style.css': [tuffexStyleEntry],
              }
            : {}),
        },
      },
    },
  },

  debug: false,

  auth: {
    isEnabled: true,
  },

  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },

  i18n: {
    locales: [
      { code: 'en', file: 'en.ts' },
      { code: 'zh', file: 'zh.ts' },
    ],
    restructureDir: 'i18n',
    langDir: 'locales',
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
  },

  pwa,

  sentry: {
    sourcemaps: {
      disable: !enableSentrySourceMaps,
    },
    sourceMapsUploadOptions: enableSentrySourceMaps
      ? {
          org: 'QuotaWish',
          project: 'tuff-nexus',
          authToken: sentryAuthToken,
        }
      : {
          enabled: false,
        },
  },
})
