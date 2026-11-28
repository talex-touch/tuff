import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineNuxtConfig } from 'nuxt/config'
import { tuffexOnDemandStylePlugin } from '../../packages/tuffex/packages/script/build/on-demand-style-plugin'
import { resolveTuffexDevMode } from './build/tuffex-dev-mode'
import { createTuffWebCodeSplittingConfig } from './build/tuff-web-manual-chunks'
import { createTuffWebPrerenderRoutes } from './build/tuff-web-prerender-routes'

const isDev = process.env.NODE_ENV !== 'production'
const currentDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(currentDir, '../..')

const tuffBusinessSourceEntry = resolve(currentDir, '../../packages/tuff-business/src/index.ts')
const tuffexComponentsSourceRoot = resolve(currentDir, '../../packages/tuffex/packages/components/src')
const tuffexDistRoot = resolve(currentDir, '../../packages/tuffex/dist/es')
const tuffexDistEntry = resolve(tuffexDistRoot, 'index.js')
const tuffexDevMode = resolveTuffexDevMode({
  isDev: isDev && process.env.NODE_ENV !== 'test',
  env: process.env,
  distEntryExists: existsSync(tuffexDistEntry),
  autoFallback: true,
})
const useTuffexSource = tuffexDevMode === 'source'
const tuffexSourceEntry = resolve(currentDir, '../../packages/tuffex/packages/components/src/index.ts')
const tuffexBaseStyleEntry = useTuffexSource
  ? resolve(currentDir, '../../packages/tuffex/packages/components/style/index.scss')
  : resolve(tuffexDistRoot, 'base.css')
const tuffexComponentSourceEntry = `${tuffexComponentsSourceRoot}/$1/index.ts`
const tuffexComponentDistEntry = `${tuffexDistRoot}/$1/index.js`
const tuffexComponentEntry = useTuffexSource ? tuffexComponentSourceEntry : tuffexComponentDistEntry
const tuffexComponentStyleEntry = resolve(tuffexDistRoot, '$1/style.css')
const tuffexComponentTypePathEntry = useTuffexSource
  ? `${tuffexComponentsSourceRoot}/*/index.ts`
  : `${tuffexDistRoot}/*/index.d.ts`
const tuffexComponentStyleTypePathEntry = resolve(tuffexDistRoot, '*/style.css')
const tuffexUtilsSourceRoot = resolve(currentDir, '../../packages/tuffex/packages/utils')
const tuffexUtilsEntry = resolve(tuffexUtilsSourceRoot, 'index.ts')
const tuffexDistUtilsEntry = useTuffexSource
  ? tuffexUtilsEntry
  : resolve(tuffexDistRoot, 'utils/index.js')
const tuffexUtilsSubpathEntry = useTuffexSource
  ? `${tuffexUtilsSourceRoot}/$1.ts`
  : `${resolve(tuffexDistRoot, 'utils/internal')}/$1.js`
const tuffexUtilsSubpathTypePathEntry = useTuffexSource
  ? `${tuffexUtilsSourceRoot}/*.ts`
  : `${resolve(tuffexDistRoot, 'packages/tuffex/packages/utils')}/*.d.ts`

const tuffexUtilsDirectNitroAliases = Object.fromEntries(
  [
    'form-host',
    'z-index-manager',
    'use-indicator-box',
    'use-jelly-indicator',
    'animation/jelly',
    'animation/spring',
  ].map(subpath => [
    `@talex-touch/tuffex/utils/${subpath}`,
    useTuffexSource
      ? resolve(tuffexUtilsSourceRoot, `${subpath}.ts`)
      : resolve(tuffexDistRoot, `utils/internal/${subpath}.js`),
  ]),
)

const DEFERRED_CHUNK_PATTERN = /(?:^|\/)(?:mermaid|katex|EventHorizon|TouchAurora|TouchRay|TuffPromoVideoModal|FlipDialog|ogl|gsap|VortexBackground|simplex-noise)/i

const tuffWebPrerenderRoutes = createTuffWebPrerenderRoutes(currentDir)

export default defineNuxtConfig({
  // Locked 2-module ceiling: ZERO @nuxt/content, ZERO @nuxtjs/i18n (uses pure synchronous vue-i18n plugin
  // with zero `/_i18n/` network fetches!), ZERO @sidebase/nuxt-auth, ZERO Pinia, ZERO Sentry, ZERO PWA.
  // Local modules `modules/tuff-web-mdc-sfc.ts`, `modules/tuff-web-nav.ts`, and `modules/tuffex-components.ts`
  // compile all product/SDK/legal markdown at build time and emit static per-locale nav chunks.
  modules: [
    '@unocss/nuxt',
    '@nuxtjs/color-mode',
  ],

  ssr: true,

  future: {
    compatibilityVersion: 4,
  },

  compatibilityDate: '2026-11-24',

  devtools: {
    enabled: false,
  },

  // Prevent Nuxt from auto-executing compiler helpers & remark/rehype plugins in `modules/` as Nuxt modules.
  ignore: [
    'modules/mdc-sfc-compiler/**',
    'modules/remark-close-component-tags.ts',
    'modules/remark-math.ts',
    'modules/remark-mermaid.ts',
    'modules/remark-shiki-code-props.ts',
    'modules/rehype-shiki-js.ts',
    'modules/shiki-js-highlighter.ts',
  ],

  app: {
    baseURL: '/',
    buildAssetsDir: '/_tuff-web/',
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#ffffff' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#121212' },
      ],
    },
  },

  css: [tuffexBaseStyleEntry],

  colorMode: {
    classSuffix: '',
  },

  components: {
    dirs: [
      {
        path: '~/components/content',
        pathPrefix: false,
      },
      {
        path: '~/components',
        ignore: [
          'content/**',
          'tuff/**',
          'store/**',
        ],
      },
    ],
  },

  runtimeConfig: {
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://tuff.tagzxia.com',
    },
  },

  build: {
    transpile: [
      '@talex-touch/tuff-business',
      '@talex-touch/utils',
      '@talex-touch/tuffex',
      '@talex-touch/tuffex-core',
    ],
  },

  experimental: {
    // Docs & legal pages compile directly to lazy Vue SFC ES modules — ZERO `_payload.json`!
    payloadExtraction: false,
    renderJsonPayloads: true,
    lazyHydration: true,
    defaults: {
      nuxtLink: {
        prefetch: true,
        prefetchOn: {
          visibility: false,
          interaction: true,
        },
      },
    },
  },

  nitro: {
    preset: 'static',
    alias: {
      ...tuffexUtilsDirectNitroAliases,
      '@talex-touch/tuffex/utils': tuffexDistUtilsEntry,
      '@talex-touch/tuff-business': tuffBusinessSourceEntry,
    },
    prerender: {
      autoSubfolderIndex: false,
      crawlLinks: false,
      concurrency: 6,
      interval: 50,
      routes: tuffWebPrerenderRoutes,
    },
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
  },

  vite: {
    build: {
      cssCodeSplit: true,
      cssMinify: 'esbuild',
      chunkSizeWarningLimit: 600,
      modulePreload: {
        polyfill: false,
        resolveDependencies(_filename, deps) {
          // Always preserve `.css` dependencies so Vite injects dynamic stylesheets cleanly.
          return deps.filter(d => d.endsWith('.css') || !DEFERRED_CHUNK_PATTERN.test(d))
        },
      },
    },
    optimizeDeps: {
      include: [
        'mermaid',
        'gsap',
        'ogl',
        'simplex-noise',
        'theme-colors',
        '@vueuse/core',
        'marked',
        '@floating-ui/vue',
        '@talex-touch/tuffex-core > @floating-ui/dom',
      ],
    },
    resolve: {
      alias: [
        { find: /^@talex-touch\/tuff-business$/, replacement: tuffBusinessSourceEntry },
        { find: /^@tuffex-components\/(.+)$/, replacement: tuffexComponentEntry },
        { find: /^@talex-touch\/tuffex$/, replacement: useTuffexSource ? tuffexSourceEntry : tuffexDistEntry },
        { find: /^@talex-touch\/tuffex\/utils\/(.+)$/, replacement: tuffexUtilsSubpathEntry },
        { find: /^@talex-touch\/tuffex\/utils$/, replacement: tuffexDistUtilsEntry },
        { find: /^@talex-touch\/tuffex\/base\.css$/, replacement: tuffexBaseStyleEntry },
        { find: /^@talex-touch\/tuffex\/([^/]+)\/style\.css$/, replacement: tuffexComponentStyleEntry },
        { find: /^@talex-touch\/tuffex\/([a-z0-9-]+)$/, replacement: tuffexComponentEntry },
      ],
    },
    plugins: [
      tuffexOnDemandStylePlugin({
        enabled: tuffexDevMode === 'dist',
        componentDistRoot: tuffexDevMode === 'dist' ? tuffexDistRoot : undefined,
      }),
    ],
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
          '@tuffex-components/*': [tuffexComponentTypePathEntry],
          '@talex-touch/tuffex': [useTuffexSource ? tuffexSourceEntry : tuffexDistEntry],
          '@talex-touch/tuffex/base.css': [tuffexBaseStyleEntry],
          '@talex-touch/tuffex/*/style.css': [tuffexComponentStyleTypePathEntry],
          '@talex-touch/tuffex/utils/*': [tuffexUtilsSubpathTypePathEntry],
          '@talex-touch/tuffex/utils': [tuffexDistUtilsEntry],
          '@talex-touch/tuffex/*': [tuffexComponentTypePathEntry],
        },
      },
    },
  },

  hooks: {
    'vite:extendConfig'(config, { isClient }) {
      if (!isClient)
        return
      const mutableConfig = config as {
        build?: {
          rollupOptions?: Record<string, unknown>
        }
      }
      mutableConfig.build = mutableConfig.build ?? {}
      const rollup = (mutableConfig.build.rollupOptions ?? {}) as Record<string, unknown>
      const existingOutput = (rollup.output && !Array.isArray(rollup.output) ? rollup.output : {}) as Record<string, unknown>
      mutableConfig.build.rollupOptions = {
        ...rollup,
        preserveEntrySignatures: false,
        output: {
          ...existingOutput,
          codeSplitting: createTuffWebCodeSplittingConfig(),
        },
      }
    },
    'build:manifest'(manifest) {
      for (const [key, entry] of Object.entries(manifest)) {
        entry.prefetch = false
        const isScript = entry.resourceType === 'script' || Boolean(entry.file?.endsWith('.js'))
        if (!isScript)
          continue
        const target = `${key} ${entry.name ?? ''} ${entry.file ?? ''}`
        if (DEFERRED_CHUNK_PATTERN.test(target))
          entry.preload = false
      }
    },
    'components:extend'(components) {
      const ignoredPatterns = [
        '/@nuxtjs/mdc/dist/runtime/components/prose/',
        '/node_modules/@nuxtjs/mdc/dist/runtime/components/prose/',
      ]
      for (let index = components.length - 1; index >= 0; index -= 1) {
        const filePath = components[index]?.filePath?.replace(/\\/g, '/') ?? ''
        if (ignoredPatterns.some(pattern => filePath.includes(pattern)))
          components.splice(index, 1)
      }
    },
  },
})
