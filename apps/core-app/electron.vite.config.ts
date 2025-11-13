import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Unocss from 'unocss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import VueSetupExtend from 'vite-plugin-vue-setup-extend'
import { fileURLToPath } from 'url'
import generatorInformation from './generator-information'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const basePath = path.join(__dirname, 'src')
const rendererPath = path.join(basePath, 'renderer', 'src')

// Disable sourcemap in production/release builds to reduce package size
const isProduction = process.env.BUILD_TYPE === 'release' || process.env.NODE_ENV === 'production'
const enableSourcemap = !isProduction

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@talex-touch/utils',
          'pinyin-match',
          'pinyin-pro',
          'fs-extra',
          'log4js',
          '@clerk/clerk-js',
          '@clerk/types',
          '@vueuse/core',
          'vue',
          'chokidar',
          '@electron-toolkit/utils',
          'drizzle-orm',
          'compressing',
          'crypto-js',
          'iconv-lite',
          'js-md5',
          'simple-plist',
          'tesseract.js',
          'xterm',
          'yauzl',
          'dayjs',
          'commander',
          'extract-file-icon',
          'electron-log',
          '@sentry/electron',
          'electron-updater'
        ]
      })
    ],
    build: {
      sourcemap: enableSourcemap,
      rollupOptions: {
        input: {
          index: 'src/main/index.ts',
          'ocr-worker': 'src/main/modules/ocr/ocr-worker.ts'
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'ocr-worker') {
              return 'ocr-worker.js'
            } else if (chunkInfo.name === 'index') {
              return 'index.js'
            }
            return '[name]-[hash].js'
          }
        },
        external: [
          '@libsql/client',
          '@libsql/core',
          '@libsql/hrana-client',
          '@libsql/isomorphic-fetch',
          '@libsql/isomorphic-ws',
          'libsql',
          'detect-libc',
          '@neon-rs/load',
          'js-base64',
          'promise-limit',
          'node-fetch',
          /^@libsql\/(darwin-arm64|darwin-x64|linux-arm64|linux-x64|win32-x64)$/
        ]
      }
    }
  },

  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@talex-touch/utils',
          'pinyin-match',
          'pinyin-pro',
          'fs-extra',
          'log4js',
          '@clerk/clerk-js',
          '@clerk/types',
          '@vueuse/core',
          'vue',
          'chokidar',
          '@electron-toolkit/utils',
          '@electron-toolkit/preload',
          'drizzle-orm',
          'compressing',
          'crypto-js',
          'iconv-lite',
          'js-md5',
          'simple-plist',
          'tesseract.js',
          'xterm',
          'yauzl',
          'dayjs',
          'commander',
          'extract-file-icon',
          'electron-log',
          '@sentry/electron',
          'electron-updater'
        ]
      })
    ],
    build: {
      sourcemap: enableSourcemap
    }
  },

  renderer: {
    resolve: {
      alias: {
        '@renderer': rendererPath,
        '@modules': path.join(rendererPath, 'modules'),
        '@comp': path.join(rendererPath, 'components'),
        '@styles': path.join(rendererPath, 'styles'),
        '@assets': path.join(rendererPath, 'assets'),
        '~': rendererPath,
        'path-browserify': 'path-browserify',
        path: 'path-browserify'
      }
    },
    define: {
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false
    },
    optimizeDeps: {
      exclude: ['electron', 'fs', 'path', 'child_process', 'original-fs']
    },
    build: {
      sourcemap: enableSourcemap,
      rollupOptions: {
        external: ['electron', 'fs', 'child_process', 'original-fs'],
        output: {
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js'
        }
      }
    },
    plugins: [
      generatorInformation(),
      vue(),
      Unocss(),
      vueJsx(),
      AutoImport({
        resolvers: [ElementPlusResolver({ importStyle: 'sass' })],
        imports: ['vue', 'vue-router'],
        dts: true
      }),
      Components({
        resolvers: [ElementPlusResolver({ importStyle: 'sass' })]
      }),
      VueSetupExtend(),
      VueI18nPlugin({
        runtimeOnly: false
      }),
      sentryVitePlugin({
        org: "quotawish",
        project: "tuff"
      })
    ]
  }
})
