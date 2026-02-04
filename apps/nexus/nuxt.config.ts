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
const currentDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(currentDir, '../..')
const tuffexSourceEntry = resolve(currentDir, '../../packages/tuffex/packages/components/src/index.ts')
const tuffexStyleEntry = resolve(currentDir, '../../packages/tuffex/packages/components/style/index.scss')
const tuffexUtilsEntry = resolve(currentDir, '../../packages/tuffex/packages/utils/index.ts')
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const disableSentry = process.env.NUXT_DISABLE_SENTRY === 'true'
const enableSentrySourceMaps = Boolean(sentryAuthToken) && !disableSentry

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

  devtools: {
    enabled: false,
  },

  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/nuxt.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
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
        highlight: {
          theme: {
            default: 'github-light',
            light: 'github-light',
            dark: 'github-dark',
          },
        },
        toc: {
          depth: 4,
          searchDepth: 4,
        },
      },
    },
  },

  runtimeConfig: {
    auth: {
      secret: process.env.AUTH_SECRET,
      origin: process.env.AUTH_ORIGIN,
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
      email: {
        from: process.env.AUTH_EMAIL_FROM,
        server: process.env.AUTH_EMAIL_SERVER,
        resendApiKey: process.env.RESEND_API_KEY,
      },
    },
    appAuthJwtSecret: process.env.APP_AUTH_JWT_SECRET,
    public: {
      auth: {
        origin: process.env.AUTH_ORIGIN,
      },
      docs: {
        asideCardChrome: process.env.NUXT_PUBLIC_DOCS_ASIDE_CARD_CHROME,
      },
    },
  },

  build: {
    transpile: ['@talex-touch/tuffex', '@talex-touch/utils'],
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2024-08-14',

  nitro: {
    preset: isDev && !useCloudflareDev ? 'node-server' : 'cloudflare-pages',
    ...(useCloudflareDev
      ? {
          cloudflareDev: {
            environment: process.env.CLOUDFLARE_DEV_ENVIRONMENT,
          },
        }
      : {}),
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    prerender: {
      crawlLinks: false,
      routes: ['/'],
      ignore: ['/hi'],
    },
  },

  vite: {
    resolve: {
      alias: [
        { find: /^@talex-touch\/tuffex$/, replacement: tuffexSourceEntry },
        { find: /^@talex-touch\/tuffex\/style\.css$/, replacement: tuffexStyleEntry },
        { find: /^@talex-touch\/tuffex\/utils$/, replacement: tuffexUtilsEntry },
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
          '@talex-touch/tuffex': [tuffexSourceEntry],
          '@talex-touch/tuffex/style.css': [tuffexStyleEntry],
          '@talex-touch/tuffex/utils': [tuffexUtilsEntry],
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
