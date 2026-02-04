import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin, PluginOption } from 'vite'
import Unocss from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import VueSetupExtend from 'vite-plugin-vue-setup-extend'
import generatorInformation from './generator-information'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const workspaceRoot = path.resolve(__dirname, '..', '..')
const basePath = path.join(__dirname, 'src')
const rendererPath = path.join(basePath, 'renderer', 'src')
const tuffexRoot = path.join(workspaceRoot, 'packages', 'tuffex')
const utilsRoot = path.join(workspaceRoot, 'packages', 'utils')
const tuffexSourceEntry = path.join(tuffexRoot, 'packages', 'components', 'src', 'index.ts')
const tuffexStyleEntry = path.join(tuffexRoot, 'packages', 'components', 'style', 'index.scss')
const tuffexUtilsEntry = path.join(tuffexRoot, 'packages', 'utils', 'index.ts')
const utilsRendererEntry = path.join(utilsRoot, 'renderer', 'index.ts')
// Disable sourcemap in production/release builds to reduce package size
const isProduction =
  process.env.BUILD_TYPE === 'release' ||
  (!process.env.BUILD_TYPE && process.env.NODE_ENV === 'production')
const enableSourcemap = !isProduction
const tuffexAliases = isProduction
  ? []
  : [
      { find: /^@talex-touch\/tuffex\/style\.css$/, replacement: tuffexStyleEntry },
      { find: /^@talex-touch\/tuffex\/utils$/, replacement: tuffexUtilsEntry },
      { find: /^@talex-touch\/tuffex$/, replacement: tuffexSourceEntry }
    ]
const utilsAliases = [{ find: /^@talex-touch\/utils\/renderer$/, replacement: utilsRendererEntry }]
const tuffexDevPlugins: PluginOption[] = isProduction
  ? []
  : [
      {
        name: 'tuffex-fs-id-normalize',
        enforce: 'pre',
        resolveId(source) {
          if (!source.startsWith('/@fs/')) return
          if (!source.includes('/packages/tuffex/')) return
          const queryIndex = source.indexOf('?')
          const pathPart = queryIndex === -1 ? source : source.slice(0, queryIndex)
          const suffix = queryIndex === -1 ? '' : source.slice(queryIndex)
          return `${pathPart.slice('/@fs/'.length)}${suffix}`
        }
      }
    ]
const vueSetupExtendPlugin = VueSetupExtend() as Plugin
const shouldSkipSetupExtend = (id: string) => {
  const cleanId = id.split('?', 1)[0]
  return cleanId.includes('/packages/tuffex/')
}
const filteredVueSetupExtend: Plugin = {
  name: 'vite:setup-name-support-filter',
  enforce: 'pre',
  transform(code, id, options) {
    if (shouldSkipSetupExtend(id)) return null
    const hook = vueSetupExtendPlugin.transform
    if (!hook) return null
    if (typeof hook === 'function') {
      return hook.call(this, code, id, options)
    }
    if (typeof hook.handler === 'function') {
      return hook.handler.call(this, code, id, options)
    }
    return null
  }
}

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
          'ocr-worker': 'src/main/modules/ocr/ocr-worker.ts',
          'file-scan-worker': 'src/main/modules/box-tool/addon/files/workers/file-scan-worker.ts',
          'file-reconcile-worker':
            'src/main/modules/box-tool/addon/files/workers/file-reconcile-worker.ts',
          'file-index-worker': 'src/main/modules/box-tool/addon/files/workers/file-index-worker.ts',
          'icon-worker': 'src/main/modules/box-tool/addon/files/workers/icon-worker.ts'
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'ocr-worker') {
              return 'ocr-worker.js'
            } else if (chunkInfo.name === 'file-scan-worker') {
              return 'file-scan-worker.js'
            } else if (chunkInfo.name === 'file-reconcile-worker') {
              return 'file-reconcile-worker.js'
            } else if (chunkInfo.name === 'file-index-worker') {
              return 'file-index-worker.js'
            } else if (chunkInfo.name === 'icon-worker') {
              return 'icon-worker.js'
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
      alias: [
        {
          find: /^~\//,
          replacement: `${rendererPath}/`
        },
        {
          find: /^assets\//,
          replacement: `${path.join(rendererPath, 'assets')}/`
        },
        ...tuffexAliases,
        ...utilsAliases
      ]
    },
    server: {
      fs: {
        // workspace packages (pnpm symlinks) may resolve outside renderer root
        allow: [workspaceRoot]
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
      ...tuffexDevPlugins,
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
      filteredVueSetupExtend,
      VueI18nPlugin({
        runtimeOnly: false
      }),
      sentryVitePlugin({
        org: 'quotawish',
        project: 'tuff',
        telemetry: false
      })
    ]
  }
})
