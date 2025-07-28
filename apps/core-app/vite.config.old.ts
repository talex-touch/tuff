import path from "path";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import vue from "@vitejs/plugin-vue";
import commonjs from "@rollup/plugin-commonjs";
import vueJsx from "@vitejs/plugin-vue-jsx";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import Unocss from "unocss/vite";
// import ElementPlus from "unplugin-element-plus/vite";
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import VueSetupExtend from "vite-plugin-vue-setup-extend";
import { fileURLToPath } from "url";
import generatorInformation from './generator-information'
import { dayjsPlugin } from "./vite-plugins/dayjs-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const basePath = path.join(__dirname, "src");

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "dist",
    lib: {
      entry: {
        index: "src/main.ts",
      },
      formats: ["cjs", "es"],
      fileName: (format) => `[name].${format === "es" ? "m" : ""}js`,
    },
    rollupOptions: {
      input: {
          main: path.resolve(__dirname, 'index.html')
      },
      external: ["simple-plist", "dayjs", "element-plus"],
      output: {
        globals: {
          'dayjs': 'dayjs',
          'lottie-web': 'lottie',
          'element-plus': 'ElementPlus',
        }
      }
    },
  },
  resolve: {
    alias: {
      "@modules": path.join(basePath, "modules"),
      "@comp": path.join(basePath, "components"),
      "@styles": path.join(basePath, "styles"),
      "@assets": path.join(basePath, "assets"),
      "~": basePath,
      'dayjs': 'dayjs',
      'dayjs/plugin/localeData': 'dayjs/plugin/localeData.js',
      'dayjs/plugin/customParseFormat': 'dayjs/plugin/customParseFormat.js',
      'dayjs/plugin/advancedFormat': 'dayjs/plugin/advancedFormat.js',
      'dayjs/plugin/weekOfYear': 'dayjs/plugin/weekOfYear.js',
      'dayjs/plugin/weekYear': 'dayjs/plugin/weekYear.js',
      'dayjs/plugin/dayOfYear': 'dayjs/plugin/dayOfYear.js',
      'dayjs/plugin/isSameOrAfter': 'dayjs/plugin/isSameOrAfter.js',
      'dayjs/plugin/isSameOrBefore': 'dayjs/plugin/isSameOrBefore.js',
    },
  },
  optimizeDeps: {
    include: [
      'dayjs',
      'lottie-web',
      'element-plus'
    ]
  },
  ssr: {
    noExternal: ['dayjs', 'element-plus'],
  },
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': '"production"',
  },
  plugins: [
    dayjsPlugin(),
    commonjs({
      ignore: ["simple-plist", "element-plus"],
      include: [/dayjs/, /lottie-web/, /node_modules\/dayjs/],
      transformMixedEsModules: true,
    }),
    generatorInformation(),
    vue(),
    electron([
      {
        // Main-Process entry file of the Electron App.
        entry: "electron/index.ts",
        onstart({ startup }) {
          startup([
            ".",
            "--no-sandbox",
            "--sourcemap",
            "--remote-debugging-port=9222",
            "--disable-gpu-process-crash-limit",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
          ]);
        },
        vite: {
          build: {
            outDir: "dist/electron",
            rollupOptions: {
              external: [
                "fsevents",
                "simple-plist",
                "element-plus",
                "extract-file-icon",
                "electron-clipboard-ex"
              ],
            },
          },
        },
      },
      {
        entry: "electron/preload.ts",
        onstart(options) {
          // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete,
          // instead of restarting the entire Electron App.
          options.reload();
        },
        vite: {
          build: {
            outDir: "dist/electron",
            rollupOptions: {
              output: {
                // Disable Preload scripts code split
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
    ]),
    renderer({
      resolve: {
        got: {
          type: "esm",
        },
      },
    }),
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
    VueI18nPlugin({
      
    })
  ],
});
