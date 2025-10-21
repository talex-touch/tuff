// electron.vite.config.ts
import path2 from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import Unocss from "unocss/vite";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import VueSetupExtend from "vite-plugin-vue-setup-extend";
import { fileURLToPath } from "url";

// generator-information.ts
import fse from "fs-extra";

// package.json
var package_default = {
  name: "@talex-touch/core-app",
  version: "2.0.0",
  description: "The core app of talex-touch. A strong adaptation more platform all-tool program.",
  main: "./out/main/index.js",
  author: "TalexDreamSoul",
  homepage: "https://talex-touch.tagzxia.com",
  scripts: {
    format: "prettier --write .",
    lint: "eslint --cache .",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "vue-tsc --noEmit -p tsconfig.web.json --composite false",
    typecheck: "npm run typecheck:node && npm run typecheck:web",
    start: "electron-vite preview",
    dev: "electron-vite dev",
    build: "npm run typecheck && electron-vite build",
    postinstall: "electron-builder install-app-deps",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "build:unpack": "npm run build && electron-builder --dir",
    "build:win": "node scripts/pre-build.js && npm run build && electron-builder --win",
    "build:mac": "npm run build && electron-builder --mac",
    "build:linux": "npm run build && electron-builder --linux",
    "build:snapshot:win": "node scripts/build-windows.js",
    "build:snapshot:mac": "node scripts/build-macos.js",
    "build:snapshot:linux": "node scripts/build-linux.js"
  },
  dependencies: {
    "@electron-toolkit/preload": "^3.0.2",
    "@electron-toolkit/utils": "^4.0.0",
    "@floating-ui/dom": "^1.7.2",
    "@floating-ui/vue": "^1.1.7",
    "@iconify-json/ri": "^1.2.5",
    "@iconify-json/simple-icons": "^1.2.44",
    "@intlify/unplugin-vue-i18n": "^6.0.8",
    "@libsql/client": "^0.15.10",
    "@milkdown/core": "^7.15.2",
    "@milkdown/ctx": "^7.15.2",
    "@milkdown/preset-commonmark": "^7.15.2",
    "@milkdown/prose": "^7.15.2",
    "@milkdown/theme-nord": "^7.15.2",
    "@milkdown/transformer": "^7.15.2",
    "@number-flow/vue": "^0.4.8",
    "@talex-touch/utils": "workspace:^",
    "@types/yauzl": "^2.10.3",
    "@unocss/transformer-attributify-jsx": "^66.3.3",
    "@vueuse/core": "^13.6.0",
    child_process: "^1.0.2",
    chokidar: "^4.0.3",
    commander: "^14.0.0",
    compressing: "^1.10.3",
    "crypto-js": "^4.2.0",
    dayjs: "^1.11.13",
    "drizzle-orm": "^0.44.4",
    "electron-log": "5.0.0-beta.28",
    "electron-updater": "^6.6.2",
    "element-plus": "^2.10.4",
    "extract-file-icon": "^0.3.2",
    "fs-extra": "^11.3.0",
    gsap: "^3.13.0",
    "hotkeys-js": "^3.13.15",
    "iconv-lite": "^0.6.3",
    "js-md5": "^0.8.3",
    log4js: "^6.9.1",
    "lottie-web": "^5.13.0",
    mousetrap: "^1.6.5",
    "original-fs": "^1.2.0",
    pinia: "^3.0.3",
    "pinyin-pro": "^3.19.6",
    remixicon: "^4.6.0",
    "simple-plist": "1.4.0-0",
    "v-shared-element": "^3.1.1",
    "v-wave": "^3.0.3",
    "vite-plugin-vue-setup-extend": "^0.4.0",
    vue: "^3.5.18",
    "vue-demi": "^0.14.10",
    "vue-draggable-plus": "^0.6.0",
    "vue-i18n": "^11.1.11",
    "vue-profile-avatar": "^1.2.0",
    "vue-router": "^4.5.1",
    xterm: "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    yauzl: "^3.2.0"
  },
  devDependencies: {
    "@electron-toolkit/eslint-config-prettier": "3.0.0",
    "@electron-toolkit/eslint-config-ts": "^3.1.0",
    "@electron-toolkit/tsconfig": "^1.0.1",
    "@rollup/plugin-commonjs": "^28.0.6",
    "@types/node": "^22.16.5",
    "@unocss/preset-attributify": "^66.3.3",
    "@unocss/preset-icons": "^66.3.3",
    "@unocss/preset-uno": "^66.3.3",
    "@unocss/transformer-variant-group": "^66.3.3",
    "@vitejs/plugin-vue": "^6.0.1",
    "@vitejs/plugin-vue-jsx": "^5.0.1",
    "cross-env": "^10.0.0",
    "drizzle-kit": "^0.31.4",
    electron: "^37.2.4",
    "electron-builder": "^25.1.8",
    "electron-vite": "^4.0.0",
    eslint: "^9.32.0",
    "eslint-plugin-vue": "^10.3.0",
    prettier: "^3.6.2",
    sass: "^1.89.2",
    typescript: "^5.8.3",
    unocss: "^66.3.3",
    "unocss-preset-theme": "^0.14.1",
    "unplugin-auto-import": "^19.3.0",
    "unplugin-vue-components": "^28.8.0",
    vite: "^7.0.6",
    "vue-eslint-parser": "^10.2.0",
    "vue-tsc": "^3.0.4"
  }
};

// generator-information.ts
import path from "path";
var __electron_vite_injected_dirname = "/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app";
console.log("[Talex-Touch] Generate Information ...");
function randomString(len) {
  let chars = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
  let maxPos = chars.length;
  let pwd = "";
  for (let i = 0; i < len; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return pwd;
}
var genSignature = () => {
  const signaturePath = path.join(__electron_vite_injected_dirname, "signature.json");
  let signatureObj = {};
  if (fse.existsSync(signaturePath)) {
    const data = fse.readJsonSync(signaturePath, { encoding: "utf8" });
    signatureObj = JSON.parse(JSON.stringify(data));
  } else {
    const signature = Buffer.from(randomString(64)).toString("hex");
    signatureObj = {
      version: package_default.version,
      date: (/* @__PURE__ */ new Date()).toISOString(),
      hash: signature
    };
    fse.writeJsonSync(signaturePath, signatureObj);
  }
  genSignature = () => signatureObj;
  return signatureObj;
};
function generatorInformation() {
  const virtualModuleId = "talex-touch:information";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;
  const signature = genSignature();
  let config;
  return {
    enforce: "pre",
    name: "generator-information",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
      return null;
    },
    buildStart() {
      const informationPath = path.resolve(config.root, "src/distinformation.json");
      const buildType = process.env.BUILD_TYPE || "release";
      const isSnapshot = buildType === "snapshot";
      const isBeta = buildType === "beta";
      const isRelease = buildType === "release";
      fse.writeFileSync(
        informationPath,
        JSON.stringify({
          refuse: false,
          version: package_default.version,
          buildTime: Date.now(),
          buildType,
          isSnapshot,
          isBeta,
          isRelease,
          signature
        })
      );
      console.log(`[Talex-Touch] generate information.json with build type: ${buildType}`);
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return;
      const devMode = config.command === "serve";
      const buildType = process.env.BUILD_TYPE || "release";
      const information = {
        buildTime: -1,
        refuse: true,
        buildType: "unknown",
        isSnapshot: false,
        isBeta: false,
        isRelease: false
      };
      if (devMode) {
        Object.assign(information, {
          refuse: false,
          buildTime: Date.now(),
          version: package_default.version,
          buildType,
          isSnapshot: buildType === "snapshot",
          isBeta: buildType === "beta",
          isRelease: buildType === "release",
          signature
        });
      } else {
        const informationPath = path.resolve(config.root, "src/information.json");
        if (fse.existsSync(informationPath)) {
          Object.assign(information, JSON.parse(fse.readJsonSync(informationPath, "utf-8")));
        }
      }
      return `
        const information = ${JSON.stringify(information)}
        export const packageJson = ${JSON.stringify(package_default)}

        export default information
      `;
    }
  };
}

// electron.vite.config.ts
var __electron_vite_injected_import_meta_url = "file:///Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app/electron.vite.config.ts";
var __filename = fileURLToPath(__electron_vite_injected_import_meta_url);
var __dirname2 = path2.dirname(__filename);
var basePath = path2.join(__dirname2, "src");
var rendererPath = path2.join(basePath, "renderer", "src");
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ["@talex-touch/utils", "pinyin-match"]
      })
    ],
    build: {
      rollupOptions: {
        input: {
          index: "src/main/index.ts",
          "ocr-worker": "src/main/modules/ocr/ocr-worker.ts"
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "ocr-worker") {
              return "ocr-worker.js";
            } else if (chunkInfo.name === "index") {
              return "index.js";
            }
            return "[name]-[hash].js";
          }
        }
      }
    }
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ["@talex-touch/utils", "pinyin-match"]
      })
    ]
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": rendererPath,
        "@modules": path2.join(rendererPath, "modules"),
        "@comp": path2.join(rendererPath, "components"),
        "@styles": path2.join(rendererPath, "styles"),
        "@assets": path2.join(rendererPath, "assets"),
        "~": rendererPath
      }
    },
    define: {
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false
    },
    optimizeDeps: {
      exclude: ["electron", "fs", "path", "child_process", "original-fs"]
    },
    build: {
      rollupOptions: {
        external: ["electron", "fs", "path", "child_process", "original-fs"]
      }
    },
    plugins: [
      // commonjs({
      //   ignore: ["simple-plist", "element-plus"],
      //   include: [/dayjs/, /lottie-web/, /node_modules\/dayjs/],
      //   transformMixedEsModules: true,
      // }),
      generatorInformation(),
      vue(),
      // electron([
      //   {
      //     // Main-Process entry file of the Electron App.
      //     entry: "electron/index.ts",
      //     onstart({ startup }) {
      //       startup([
      //         ".",
      //         "--no-sandbox",
      //         "--sourcemap",
      //         "--remote-debugging-port=9222",
      //         "--disable-gpu-process-crash-limit",
      //         "--disable-renderer-backgrounding",
      //         "--disable-backgrounding-occluded-windows",
      //       ]);
      //     },
      //     vite: {
      //       build: {
      //         outDir: "dist/electron",
      //         rollupOptions: {
      //           external: [
      //             "fsevents",
      //             "simple-plist",
      //             "element-plus",
      //             "extract-file-icon",
      //             "electron-clipboard-ex"
      //           ],
      //         },
      //       },
      //     },
      //   },
      //   {
      //     entry: "electron/preload.ts",
      //     onstart(options) {
      //       // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete,
      //       // instead of restarting the entire Electron App.
      //       options.reload();
      //     },
      //     vite: {
      //       build: {
      //         outDir: "dist/electron",
      //         rollupOptions: {
      //           output: {
      //             // Disable Preload scripts code split
      //             inlineDynamicImports: true,
      //           },
      //         },
      //       },
      //     },
      //   },
      // ]),
      Unocss(),
      vueJsx(),
      AutoImport({
        resolvers: [ElementPlusResolver({ importStyle: "sass" })],
        imports: ["vue", "vue-router"],
        dts: true
      }),
      Components({
        resolvers: [ElementPlusResolver({ importStyle: "sass" })]
      }),
      VueSetupExtend(),
      VueI18nPlugin({})
    ]
  }
});
export {
  electron_vite_config_default as default
};
