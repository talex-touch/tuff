import fs from 'node:fs'
import path from "node:path";
import { spawn } from 'node:child_process'
import { builtinModules } from 'node:module'
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
export default defineConfig(({ command, mode, isSsrBuild, isPreview }) => {

    console.log(command, mode, isSsrBuild, isPreview)

    if (!isDev && !isTest) {
        for (const dir of ['dist', 'plugin']) {

            fs.rmSync(path.join(__dirname, dir), { recursive: true, force: true })

        }
    }

    const build = {
        minify: !isDev,
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
            external: [
                'mica-electron',
                'electron',
                'vite',
                'vite-plugin-electron-renderer',
                ...builtinModules,
                ...builtinModules.map(m => `node:${m}`),
                ...Object.keys('dependencies' in pkg ? pkg.dependencies as object : {}),
            ],
            output: {
                exports: 'named',
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
        plugins: [
            {
                name: 'generate-types',
                async closeBundle() {
                    if (isTest) return

                    removeTypes()
                    await generateTypes()
                    moveTypesToDist()
                    removeTypes()
                }
            },
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

function removeTypes() {
    fs.rmSync(path.join(__dirname, 'types'), { recursive: true, force: true })
}

function generateTypes() {
    return new Promise(resolve => {
        const cp = spawn(
            process.platform === 'win32' ? 'npm.cmd' : 'npm',
            ['run', 'types'],
            { stdio: 'inherit' },
        )
        cp.on('exit', code => {
            !code && console.log('[types]', 'declaration generated')
            resolve(code)
        })
        cp.on('error', process.exit)
    })
}

function moveTypesToDist() {
    const types = path.join(__dirname, 'types')
    const dist = path.join(__dirname, 'dist')
    const files = fs.readdirSync(types).filter(n => n.endsWith('.d.ts'))
    for (const file of files) {
        const from = path.join(types, file)
        const to = path.join(dist, file)
        fs.writeFileSync(to, fs.readFileSync(from, 'utf8'))

        const cwd = process.cwd()
        console.log('[types]', `${path.relative(cwd, from)} -> ${path.relative(cwd, to)}`)
    }
}