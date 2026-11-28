import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineNuxtConfig } from 'nuxt/config'
import { tuffexOnDemandStylePlugin } from '../../packages/tuffex/packages/script/build/on-demand-style-plugin'
import { resolveTuffexDevMode } from './build/tuffex-dev-mode'
import { tuffexFrameworkRuntimePlugin } from './build/tuffex-framework-runtime-plugin'
import { createTuffexCodeSplittingConfig } from './build/tuffex-manual-chunks'
import { createTuffexPrerenderRoutes } from './build/tuffex-prerender-routes'

const isDev = process.env.NODE_ENV !== 'production'
const currentDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(currentDir, '../..')

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
const tuffexChartSubpathEntry = useTuffexSource
  ? `${tuffexComponentsSourceRoot}/charts/src/$1/index.ts`
  : `${tuffexDistRoot}/charts/src/$1/index.js`
const tuffexChartSubpathTypePathEntry = useTuffexSource
  ? `${tuffexComponentsSourceRoot}/charts/src/*/index.ts`
  : `${tuffexDistRoot}/charts/src/*/index.d.ts`
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

const DEFERRED_CHUNK_PATTERN = /(?:^|\/)components\/content\/demos\/|demo-|Demo\.|demo-icons|tuffex-wc-|vendor-three|vendor-echarts|vendor-mermaid|vendor-react|echarts|mermaid|(?:^|[-_/])react(?:[-_./]|$)|Gallery.*Suite|katex/i

const tuffexPrerenderRoutes = createTuffexPrerenderRoutes(currentDir)

export default defineNuxtConfig({
  // Locked 3-module ceiling: ZERO @nuxt/content, ZERO SQLite, ZERO Sentry, ZERO Auth, ZERO PWA, ZERO Pinia.
  // Local modules `modules/tuffex-mdc-sfc.ts`, `modules/tuffex-nav.ts`, and `modules/tuffex-components.ts`
  // provide VitePress-style `.mdc -> Vue 3 SFC` compilation, static nav chunks, and on-demand TuffEx components.
  modules: [
    '@unocss/nuxt',
    '@nuxtjs/color-mode',
    '@nuxtjs/i18n',
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
    baseURL: '/tuffex/',
    buildAssetsDir: '/_tuffex/',
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
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
        ignore: [
          'demos/**',
          'demo-registry.ts',
        ],
      },
      {
        path: '~/components',
        ignore: [
          'content/**',
        ],
      },
    ],
  },

  i18n: {
    locales: [
      { code: 'en', language: 'en-US' },
      { code: 'zh', language: 'zh-CN' },
    ],
    restructureDir: 'i18n',
    defaultLocale: 'en',
    strategy: 'no_prefix',
    baseUrl: 'https://tuff.tagzxia.com',
    detectBrowserLanguage: false,
    vueI18n: './i18n.config.ts',
  },

  runtimeConfig: {
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://tuff.tagzxia.com',
    },
  },

  build: {
    transpile: [
      '@talex-touch/utils',
      '@talex-touch/tuffex',
      '@talex-touch/tuffex-core',
    ],
  },

  experimental: {
    // Docs compile directly to lazy `.mdc.js` Vue SFC ES modules — zero `_payload.json`!
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
    },
    prerender: {
      autoSubfolderIndex: false,
      crawlLinks: false,
      concurrency: 6,
      interval: 50,
      routes: tuffexPrerenderRoutes,
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
          // NEVER filter `.css` assets from Vite's `__vitePreload` dependency list:
          // Vite injects dynamic chunk stylesheets through `deps`, so dropping CSS matching
          // `Demo.` or `Gallery.*Suite` breaks demo and suite styling at runtime.
          return deps.filter(d => d.endsWith('.css') || !DEFERRED_CHUNK_PATTERN.test(d))
        },
      },
    },
    optimizeDeps: {
      include: [
        'mermaid',
        'gsap',
        '@vueuse/core',
        'marked',
        'echarts/core',
        'echarts/charts',
        'echarts/components',
        'echarts/renderers',
        '@floating-ui/vue',
        '@talex-touch/tuffex-core > @floating-ui/dom',
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
      ],
    },
    resolve: {
      alias: [
        { find: /^@tuffex-components\/(.+)$/, replacement: tuffexComponentEntry },
        { find: /^@talex-touch\/tuffex$/, replacement: useTuffexSource ? tuffexSourceEntry : tuffexDistEntry },
        { find: /^@talex-touch\/tuffex\/utils\/(.+)$/, replacement: tuffexUtilsSubpathEntry },
        { find: /^@talex-touch\/tuffex\/utils$/, replacement: tuffexDistUtilsEntry },
        { find: /^@talex-touch\/tuffex\/base\.css$/, replacement: tuffexBaseStyleEntry },
        { find: /^@talex-touch\/tuffex\/([^/]+)\/style\.css$/, replacement: tuffexComponentStyleEntry },
        { find: /^@talex-touch\/tuffex\/charts\/src\/([a-z0-9-]+)$/, replacement: tuffexChartSubpathEntry },
        { find: /^@talex-touch\/tuffex\/([a-z0-9-]+)$/, replacement: tuffexComponentEntry },
      ],
    },
    plugins: [
      tuffexFrameworkRuntimePlugin(currentDir),
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
          '@tuffex-components/*': [tuffexComponentTypePathEntry],
          '@talex-touch/tuffex': [useTuffexSource ? tuffexSourceEntry : tuffexDistEntry],
          '@talex-touch/tuffex/base.css': [tuffexBaseStyleEntry],
          '@talex-touch/tuffex/*/style.css': [tuffexComponentStyleTypePathEntry],
          '@talex-touch/tuffex/utils/*': [tuffexUtilsSubpathTypePathEntry],
          '@talex-touch/tuffex/utils': [tuffexDistUtilsEntry],
          '@talex-touch/tuffex/charts/src/*': [tuffexChartSubpathTypePathEntry],
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
          codeSplitting: createTuffexCodeSplittingConfig(),
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
        '/app/components/content/demos/',
        '/app/components/content/demo-registry.ts',
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
