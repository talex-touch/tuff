import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants/index'
import { remarkMermaid } from './app/utils/remark-mermaid'

loadEnv({ path: '.env' })
loadEnv({ path: `.env.${process.env.NODE_ENV ?? 'development'}` })
loadEnv({ path: '.env.local', override: true })
loadEnv({ path: `.env.${process.env.NODE_ENV ?? 'development'}.local`, override: true })

const isDev = process.env.NODE_ENV !== 'production'
const currentDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(currentDir, '../..')
const tuffexSourceEntry = resolve(currentDir, '../../packages/tuffex/packages/components/src/index.ts')
const tuffexStyleEntry = resolve(currentDir, '../../packages/tuffex/packages/components/style/index.scss')
const tuffexUtilsEntry = resolve(currentDir, '../../packages/tuffex/packages/utils/index.ts')

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
    '@clerk/nuxt',
    '@sentry/nuxt/module',
    ...(isDev ? ['nitro-cloudflare-dev'] : []),
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
        remarkPlugins: [remarkMermaid],
        highlight: {
          theme: {
            default: 'github-light',
            light: 'github-light',
            dark: 'github-dark',
          },
        },
        toc: {
          depth: 3,
          searchDepth: 3,
        },
      },
    },
  },

  runtimeConfig: {
    clerk: {
      secretKey: process.env.CLERK_SECRET_KEY,
      webhookSigningSecret: process.env.CLERK_WEBHOOK_SECRET,
      jwtKey: process.env.CLERK_JWT_KEY,
      machineSecretKey: process.env.CLERK_MACHINE_KEY,
    },
    appAuthJwtSecret: process.env.APP_AUTH_JWT_SECRET,
    public: {
      clerk: {
        publishableKey: process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        signInUrl: process.env.NUXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in',
        signUpUrl: process.env.NUXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up',
        domain: process.env.NUXT_PUBLIC_CLERK_DOMAIN,
        proxyUrl: process.env.NUXT_PUBLIC_CLERK_PROXY_URL,
        pricingTableId: process.env.NUXT_PUBLIC_CLERK_PRICING_TABLE_ID,
      },
      docs: {
        asideCardChrome: process.env.NUXT_PUBLIC_DOCS_ASIDE_CARD_CHROME,
      },
    },
  },

  build: {
    transpile: ['@talex-touch/tuffex'],
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
    preset: 'cloudflare-pages',
    ...(isDev
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

  clerk: {
    ...(process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      ? { publishableKey: process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY }
      : {}),
    signInUrl: process.env.NUXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in',
    signUpUrl: process.env.NUXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up',
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
    sourceMapsUploadOptions: {
      org: 'quotawish',
      project: 'tuff-nexus',
      // store your auth token in an environment variable
      authToken: process.env.SENTRY_AUTH_TOKEN,
    },
  },
})
