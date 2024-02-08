import fs from 'node:fs'
import path, { resolve } from "node:path";
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import vue from '@vitejs/plugin-vue'

import pkg from './package.json'

import vueJsx from "@vitejs/plugin-vue-jsx";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import Unocss from "unocss/vite";
// import ElementPlus from "unplugin-element-plus/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import VueSetupExtend from "vite-plugin-vue-setup-extend";

const basePath = path.join(__dirname, "src");

const isDev = process.argv.slice(2).includes('--watch')
const isTest = process.env.NODE_ENV === 'test'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {

    console.log("*** TALEX-TOUCH | Starting to build ...")

    console.log(mode)

    if (!isDev && !isTest) {
        for (const dir of ['dist', 'plugin']) {

            fs.rmSync(path.join(__dirname, dir), { recursive: true, force: true })

        }
    }

    const build = {
        base: './',
        // minify: !isDev,
        emptyOutDir: false,
        outDir: 'dist',
        lib: {
            entry: {
                index: 'src/main.ts',
            },
            formats: ['cjs', 'es'],
            fileName: format => `[name].${format === 'es' ? 'm' : ''}js`
        },
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html')
            },
        },
    }

    return {
        build,
        resolve: {
            alias: {
                "@modules": path.join(basePath, "modules"),
                "@comp": path.join(basePath, "components"),
                "@styles": path.join(basePath, "styles"),
                "@assets": path.join(basePath, "assets"),
                "~": basePath,
            },
        },
        // css: {
        //     preprocessorOptions: {
        //         scss: {
        //             additionalData: `@use "~/styles/index.scss" as *;`
        //         }
        //     }
        // },
        plugins: [
            vue(),
            electron([
                {
                    // Main-Process entry file of the Electron App.
                    entry: 'electron/index.ts',
                    onstart({ startup }) {
                        startup([
                            '.',
                            '--no-sandbox',
                            '--sourcemap',
                            // For Chrome devtools
                            '--remote-debugging-port=9222',
                        ])
                    },
                    vite: {
                        build: {
                            outDir: 'dist/electron',
                            rollupOptions: {
                                external: [
                                    'talex-mica-electron',
                                    'mica-electron'
                                ]
                            }
                        }
                    }
                },
                {
                    entry: 'electron/preload.ts',
                    onstart(options) {
                        // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete,
                        // instead of restarting the entire Electron App.
                        options.reload()
                    },
                    vite: {
                        build: {
                            outDir: 'dist/electron'
                        }
                    }
                },
            ]),
            renderer({
                resolve: {
                    got: {
                        type: 'esm'
                    }
                }
            }),
            // ElementPlus({
            //     useSource: true,
            // }),
            Unocss(),
            vueJsx(),
            AutoImport({
                resolvers: [ElementPlusResolver()],
                imports: ["vue"],
            }),
            Components({
                resolvers: [ElementPlusResolver()],
            }),
            VueSetupExtend(),
        ],
    }

})
