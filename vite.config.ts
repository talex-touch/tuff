import { rmSync } from 'fs'
import _path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import pkg from './package.json'

import commonjsExternal from 'vite-plugin-commonjs-externals'
// import tsconfigPaths from 'vite-tsconfig-paths'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import topLevelAwait from 'vite-plugin-top-level-await'

rmSync('dist', { recursive: true, force: true }) // v14.14.0

const externals =  [ 'path', 'fs/promises', 'process', 'os', 'crypto', 'child_process', 'electron' ]

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@modules',
        replacement: _path.resolve(__dirname, 'src/modules') // "/src/modules"
      },
      {
        find: '@assets',
        replacement: _path.resolve(__dirname, 'src/assets') // "/src/assets"
      },
      {
        find: '@comp',
        replacement: _path.resolve(__dirname, 'src/components') // "/src/components"
      },
      {
        find: '@styles',
        replacement: _path.resolve(__dirname, 'src/styles') // "/src/styles"
      },
      {
        find: '~',
        replacement: _path.resolve(__dirname, 'src')
      }
    ]
  },
  plugins: [
    vue(),
    electron([
      {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            // For Debug
            sourcemap: false,
            outDir: 'dist/electron/main',
          },
          // Will start Electron via VSCode Debug
          // plugins: [ process.env.VSCODE_DEBUG ? startup : null ],
        }
        // preload: {
        //   input: {
        //     // You can configure multiple preload here
        //     index: path.join(__dirname, 'electron/preload/index.ts'),
        //   },
        //   vite: {
        //     build: {
        //       // For Debug
        //       sourcemap: 'inline',
        //       outDir: 'dist/electron/preload',
        //     },
        //   },
        // },
        // Enables use of Node.js API adopters the Renderer-process
        // https://github.com/electron-vite/vite-plugin-electron/tree/main/packages/electron-renderer#electron-renderervite-serve
        // renderer: {},
      }
      ,
      {
        entry: 'electron/addon/home-gear/preload.ts',
        vite: {
          build: {
            outDir: 'dist/electron/addon/home-gear',
          }
        },
        onstart(options) {
          options.reload()
        }
      }
    ]),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    VueI18nPlugin({
      include: _path.resolve(_path.dirname(fileURLToPath(import.meta.url)), './src/assets/languages/**')
    }),
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: "__tla",
      // The function to generate import names of top-level await promise adopters each chunk module
      promiseImportName: i => `__tla_${i}`
    }),
    // tsconfigPaths(),
    commonjsExternal({
      externals
    })
  ],
  optimizeDeps: {
    exclude: externals
  },
  server: process.env.VSCODE_DEBUG ? {
    host: pkg.debug.env.VITE_DEV_SERVER_HOSTNAME,
    port: pkg.debug.env.VITE_DEV_SERVER_PORT,
  } : undefined,
  build: {
    rollupOptions: {
      external: [
        'service'
      ]
    }
  }
})
