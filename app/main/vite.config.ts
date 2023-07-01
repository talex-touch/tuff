import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import vue from '@vitejs/plugin-vue'
import path from "path";

import vueJsx from "@vitejs/plugin-vue-jsx";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import Unocss from "unocss/vite";
// import ElementPlus from "unplugin-element-plus/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import VueSetupExtend from "vite-plugin-vue-setup-extend";

const basePath = path.join(__dirname, "src");

// https://vitejs.dev/config/
export default defineConfig({
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
        vue(),
        electron([
            {
                // Main-Process entry file of the Electron App.
                entry: 'electron/index.ts'
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
})
