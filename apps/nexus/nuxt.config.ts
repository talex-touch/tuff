import process from 'node:process'
import { config as loadEnv } from 'dotenv'
import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants/index'

/* eslint-disable nuxt/nuxt-config-keys-order */

loadEnv({ path: '.env' })
loadEnv({ path: `.env.${process.env.NODE_ENV ?? 'development'}` })
loadEnv({ path: '.env.local', override: true })
loadEnv({ path: `.env.${process.env.NODE_ENV ?? 'development'}.local`, override: true })

const isDev = process.env.NODE_ENV !== 'production'

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

  sentry: {
    sourceMapsUploadOptions: {
      org: 'quotawish',
      project: 'tuff-nexus',
      // store your auth token in an environment variable
      authToken: process.env.SENTRY_AUTH_TOKEN,
    },
  },

  content: {
    highlight: {
      theme: 'github-dark',
    },
    experimental: {
      nativeSqlite: true,
    },
  },

  i18n: {
    locales: [
      {
        code: 'en',
        name: 'English',
        file: 'en.ts',
      },
      {
        code: 'zh',
        name: '中文',
        file: 'zh.ts',
      },
    ],
    defaultLocale: 'en',
    langDir: 'locales',
    lazy: true,
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    vueI18n: './i18n.config.ts',
  },

  debug: false,

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

  colorMode: {
    classSuffix: '',
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

  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },

  clerk: {
    publishableKey: process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    signInUrl: process.env.NUXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in',
    signUpUrl: process.env.NUXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up',
    domain: process.env.NUXT_PUBLIC_CLERK_DOMAIN,
    proxyUrl: process.env.NUXT_PUBLIC_CLERK_PROXY_URL,
  },

  runtimeConfig: {
    clerk: {
      secretKey: process.env.CLERK_SECRET_KEY,
      webhookSigningSecret: process.env.CLERK_WEBHOOK_SECRET,
      jwtKey: process.env.CLERK_JWT_KEY,
      machineSecretKey: process.env.CLERK_MACHINE_KEY,
    },
    public: {
      clerk: {
        publishableKey: process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        signInUrl: process.env.NUXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in',
        signUpUrl: process.env.NUXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up',
        domain: process.env.NUXT_PUBLIC_CLERK_DOMAIN,
        proxyUrl: process.env.NUXT_PUBLIC_CLERK_PROXY_URL,
        pricingTableId: process.env.NUXT_PUBLIC_CLERK_PRICING_TABLE_ID,
      },
    },
  },

  pwa,
})

/* eslint-enable nuxt/nuxt-config-keys-order */
