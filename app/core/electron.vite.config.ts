import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import vueJsx from '@vitejs/plugin-vue-jsx'

import topLevelAwait from 'vite-plugin-top-level-await'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import VueSetupExtend from 'vite-plugin-vue-setup-extend'

const externals = ['path'];

export default defineConfig({
    main: {
        publicDir: '../../public',
        build: {
            outDir: "dist/main",
            rollupOptions: {
                input: {
                    index: path.resolve(__dirname, 'main/index.ts')
                }
            }
        },
        resolve: {
            alias: [
                {
                    find: '@addon',
                    replacement: path.resolve(__dirname, 'main/addon')
                },
                {
                    find: '@config',
                    replacement: path.resolve(__dirname, 'main/config')
                },
                {
                    find: '@utils',
                    replacement: path.resolve(__dirname, 'main/utils')
                },
                {
                    find: '@assets',
                    replacement: path.resolve(__dirname, 'assets')
                },
                {
                    find: '~',
                    replacement: path.resolve(__dirname)
                }
            ]
        },
        plugins: [
            externalizeDepsPlugin({
                exclude: []
            })
        ]
    },
    renderer: () => {
        const basePath = path.resolve(__dirname, 'renderer')

        console.log( basePath )

        return {
            root: basePath,
            build: {
                outDir: "dist/renderer",
                rollupOptions: {
                    input: {
                        index: path.resolve(basePath, 'index.html'),
                    }
                }
            },
            resolve: {
                alias: {
                    "@modules": path.resolve(basePath, 'modules'),
                    "@comp": path.resolve(basePath, 'components'),
                    "@styles": path.resolve(basePath, 'styles'),
                    "@assets": path.resolve(basePath, 'assets'),
                    "~": path.resolve(basePath)
                }
            },
            plugins: [
                vue({
                    customElement: [
                        'webview'
                    ]
                }),
                vueJsx(),
                AutoImport({
                    resolvers: [ElementPlusResolver()],
                    imports: ['vue']
                }),
                Components({
                    resolvers: [ElementPlusResolver()],
                }),
                VueI18nPlugin({
                    include: path.resolve(__dirname, 'assets/languages/**')
                }),
                topLevelAwait({
                    // The export name of top-level await promise for each chunk module
                    promiseExportName: "__touch",
                    // The function to generate import names of top-level await promise adopters each chunk module
                    promiseImportName: i => `__touch_${i}`
                }),
                VueSetupExtend()
            ],
            optimizeDeps: {
                exclude: externals
            }
            /* server: process.env.VSCODE_DEBUG ? {
                host: pkg.debug.env.VITE_DEV_SERVER_HOSTNAME,
                port: pkg.debug.env.VITE_DEV_SERVER_PORT,
              } : undefined, */
        }
    }
})