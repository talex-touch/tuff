import { sentryVitePlugin } from '@sentry/vite-plugin'
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
      // 只保留必要的workspace包，其他依赖尽可能外部化以减小包体
      externalizeDepsPlugin({
        exclude: [
          '@talex-touch/utils' // workspace 包必须打包
        ]
      })
    ],
    resolve: {
      alias: {
        // 强制 @libsql/isomorphic-ws 使用 web 版本而不是 node 版本
        // 这样就不会引入 ws 模块，避免原生依赖问题
        '@libsql/isomorphic-ws': '@libsql/isomorphic-ws/web.mjs'
      }
    },
    define: {
      // 这些环境变量现在不再需要，因为我们完全避免了 ws
      // 'process.env.WS_NO_BUFFER_UTIL': 'true',
      // 'process.env.WS_NO_UTF_8_VALIDATE': 'true'
    },
    build: {
      sourcemap: enableSourcemap,
      commonjsOptions: {
        // libsql chooses native binding at runtime via dynamic require
        ignoreDynamicRequires: true
      },
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
        }
      }
    }
  },

  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@talex-touch/utils'] // workspace 包必须打包
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
        '~': rendererPath
      }
    },
    define: {
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false
    },
    optimizeDeps: {
      exclude: ['electron', 'fs', 'child_process', 'original-fs']
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
        org: 'quotawish',
        project: 'tuff'
      })
    ]
  }
})
