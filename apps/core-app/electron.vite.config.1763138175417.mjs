// electron.vite.config.ts
import { sentryVitePlugin } from "@sentry/vite-plugin";
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
  version: "2.4.6",
  description: "A strong adaptation more platform all-tool program.",
  main: "./out/main/index.js",
  author: "TalexDreamSoul <TalexDreamSoul@Gmail.com>",
  homepage: "https://tuff.tagzxia.com",
  scripts: {
    format: "prettier --write .",
    lint: "eslint --cache .",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "vue-tsc --noEmit -p tsconfig.web.json --composite false",
    typecheck: "npm run typecheck:node && npm run typecheck:web",
    start: "electron-vite preview",
    dev: "electron-vite dev",
    build: "npm run typecheck && electron-vite build",
    postbuild: "node scripts/prepare-out-package-json.js",
    postinstall: "echo 'Skipping electron-builder install-app-deps - will run during build'",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "build:unpack": "npm run build && electron-builder --dir",
    "build:snapshot": "node scripts/build-target.js --target=${BUILD_TARGET:-mac} --type=snapshot",
    "build:release": "node scripts/build-target.js --target=${BUILD_TARGET:-mac} --type=release",
    "build:win": "node scripts/build-target.js --target=win --type=release",
    "build:mac": "node scripts/build-target.js --target=mac --type=release",
    "build:linux": "node scripts/build-target.js --target=linux --type=release",
    "build:snapshot:win": "node scripts/build-target.js --target=win --type=snapshot",
    "build:snapshot:mac": "node scripts/build-target.js --target=mac --type=snapshot",
    "build:snapshot:linux": "node scripts/build-target.js --target=linux --type=snapshot",
    "build:release:win": "node scripts/build-target.js --target=win --type=release",
    "build:release:mac": "node scripts/build-target.js --target=mac --type=release",
    "build:release:linux": "node scripts/build-target.js --target=linux --type=release"
  },
  dependencies: {
    "@electron-toolkit/preload": "^3.0.2",
    "@electron-toolkit/utils": "^4.0.0",
    "@libsql/client": "^0.15.15",
    "@sentry/electron": "^7.2.0",
    "@talex-touch/utils": "workspace:^",
    "@types/yauzl": "^2.10.3",
    chokidar: "^4.0.3",
    commander: "^14.0.2",
    compressing: "^2.0.0",
    "crypto-js": "^4.2.0",
    "detect-libc": "^2.0.4",
    dayjs: "^1.11.19",
    "drizzle-orm": "^0.44.7",
    "electron-log": "5.0.0-beta.28",
    "electron-updater": "^6.6.2",
    "extract-file-icon": "^0.3.2",
    "fs-extra": "^11.3.2",
    "hotkeys-js": "^3.13.15",
    "iconv-lite": "^0.7.0",
    "js-md5": "^0.8.3",
    log4js: "^6.9.1",
    "mac-windows": "1.0.0",
    mousetrap: "^1.6.5",
    "original-fs": "^1.2.0",
    "pinyin-match": "^1.2.8",
    "pinyin-pro": "^3.27.0",
    "simple-plist": "1.4.0-0",
    "tesseract.js": "^6.0.1",
    xterm: "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    yauzl: "^3.2.0"
  },
  devDependencies: {
    "@clerk/clerk-js": "^5.103.1",
    "@clerk/types": "^4.96.0",
    "@electron-toolkit/eslint-config-prettier": "3.0.0",
    "@electron-toolkit/eslint-config-ts": "^3.1.0",
    "@electron-toolkit/tsconfig": "^2.0.0",
    "@floating-ui/dom": "^1.7.4",
    "@floating-ui/vue": "^1.1.9",
    "@iconify-json/carbon": "^1.2.4",
    "@iconify-json/ri": "^1.2.6",
    "@iconify-json/simple-icons": "^1.2.56",
    "@intlify/unplugin-vue-i18n": "^11.0.1",
    "@milkdown/core": "^7.17.1",
    "@milkdown/ctx": "^7.17.1",
    "@milkdown/preset-commonmark": "^7.17.1",
    "@milkdown/prose": "^7.17.1",
    "@milkdown/theme-nord": "^7.17.1",
    "@milkdown/plugin-listener": "^7.17.1",
    "@milkdown/transformer": "^7.17.1",
    "@number-flow/vue": "^0.4.8",
    "@rollup/plugin-commonjs": "^29.0.0",
    "@types/node": "^22.18.13",
    "@unocss/preset-attributify": "^66.5.4",
    "@unocss/preset-icons": "^66.5.4",
    "@unocss/preset-uno": "^66.5.4",
    "@unocss/transformer-attributify-jsx": "^66.5.4",
    "@unocss/transformer-variant-group": "^66.5.4",
    "@vitejs/plugin-vue": "^6.0.1",
    "@vitejs/plugin-vue-jsx": "^5.1.1",
    "@vueuse/core": "^14.0.0",
    child_process: "^1.0.2",
    "cross-env": "^10.1.0",
    "drizzle-kit": "^0.31.6",
    electron: "^38.5.0",
    "electron-builder": "^26.0.12",
    "electron-vite": "^4.0.1",
    "element-plus": "^2.11.7",
    eslint: "^9.39.0",
    "eslint-plugin-vue": "^10.5.1",
    gsap: "^3.13.0",
    "lottie-web": "^5.13.0",
    "path-browserify": "^1.0.1",
    pinia: "^3.0.3",
    prettier: "^3.6.2",
    remixicon: "^4.7.0",
    sass: "^1.93.3",
    typescript: "^5.9.3",
    unocss: "^66.5.4",
    "unocss-preset-theme": "^0.14.1",
    "unplugin-auto-import": "^20.2.0",
    "unplugin-vue-components": "^30.0.0",
    "v-shared-element": "^3.1.1",
    "v-wave": "^3.0.4",
    vite: "^7.1.12",
    "vite-plugin-vue-setup-extend": "^0.4.0",
    vue: "^3.5.22",
    "vue-demi": "^0.14.10",
    "vue-draggable-plus": "^0.6.0",
    "vue-eslint-parser": "^10.2.0",
    "vue-i18n": "^11.1.12",
    "vue-profile-avatar": "^1.2.0",
    "vue-router": "^4.6.3",
    "vue-sonner": "^2.0.9",
    "vue-tsc": "^3.1.2"
  },
  license: "MPL-2.0 license"
};

// generator-information.ts
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
var __electron_vite_injected_dirname = "/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app";
console.log("[Talex-Touch] Generate Information ...");
function generateBuildIdentifier(timestamp) {
  const lastSixDigits = timestamp % 1e6;
  const hash = crypto.createHash("md5").update(String(lastSixDigits)).digest("hex");
  return hash.substring(0, 7);
}
function getGitCommitHash() {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA;
  }
  try {
    const projectRoot = path.join(__electron_vite_injected_dirname, "..");
    const hash = execSync("git rev-parse HEAD", {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return hash || null;
  } catch {
    return null;
  }
}
function generateOfficialSignature(version, buildTime, buildType, gitCommitHash) {
  const encryptionKey = process.env.TUFF_ENCRYPTION_KEY;
  if (!encryptionKey) {
    return {
      officialSignature: null,
      hasOfficialKey: false
    };
  }
  const payload = JSON.stringify({
    version,
    buildTime,
    buildType,
    gitCommitHash
  });
  const hmac = crypto.createHmac("sha256", encryptionKey);
  hmac.update(payload);
  const signature = hmac.digest("hex");
  return {
    officialSignature: signature,
    hasOfficialKey: true
  };
}
function getBuildChannel(buildType) {
  if (buildType === "release") {
    return "RELEASE";
  } else if (buildType === "snapshot") {
    return "SNAPSHOT";
  } else if (buildType === "beta") {
    return "BETA";
  }
  return "UNKNOWN";
}
function generateBuildInfo() {
  const buildTime = Date.now();
  const buildType = process.env.BUILD_TYPE || "release";
  const isSnapshot = buildType === "snapshot";
  const isBeta = buildType === "beta";
  const isRelease = buildType === "release";
  const gitCommitHash = getGitCommitHash();
  const buildIdentifier = generateBuildIdentifier(buildTime);
  const channel = getBuildChannel(buildType);
  const { officialSignature, hasOfficialKey } = generateOfficialSignature(
    package_default.version,
    buildTime,
    buildType,
    gitCommitHash
  );
  return {
    version: package_default.version,
    buildTime,
    buildIdentifier,
    buildType,
    channel,
    isSnapshot,
    isBeta,
    isRelease,
    gitCommitHash: gitCommitHash || void 0,
    officialSignature: officialSignature || void 0,
    hasOfficialKey
  };
}
function generatorInformation() {
  const virtualModuleId = "talex-touch:information";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;
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
      const buildInfo = generateBuildInfo();
      const signaturePath = path.join(__electron_vite_injected_dirname, "signature.json");
      fse.writeJsonSync(signaturePath, buildInfo, { encoding: "utf8", spaces: 2 });
      console.log(`[Talex-Touch] Generated signature.json with build type: ${buildInfo.buildType}`);
      console.log(`[Talex-Touch] Build identifier: ${buildInfo.buildIdentifier}`);
      console.log(`[Talex-Touch] Channel: ${buildInfo.channel}`);
      console.log(`[Talex-Touch] Git commit: ${buildInfo.gitCommitHash || "N/A"}`);
      console.log(`[Talex-Touch] Official build: ${buildInfo.hasOfficialKey ? "Yes" : "No"}`);
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return;
      const devMode = config.command === "serve";
      if (devMode) {
        const buildInfo = generateBuildInfo();
        const information2 = {
          refuse: false,
          ...buildInfo
        };
        return `
          const information = ${JSON.stringify(information2)}
          export const packageJson = ${JSON.stringify(package_default)}

          export default information
        `;
      }
      const signaturePath = path.join(__electron_vite_injected_dirname, "signature.json");
      const information = {
        buildTime: -1,
        refuse: true,
        buildType: "unknown",
        isSnapshot: false,
        isBeta: false,
        isRelease: false
      };
      if (fse.existsSync(signaturePath)) {
        try {
          const buildInfo = fse.readJsonSync(signaturePath, { encoding: "utf8" });
          Object.assign(information, {
            refuse: false,
            ...buildInfo
          });
        } catch (error) {
          console.warn("[Talex-Touch] Failed to read signature.json:", error);
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
var isProduction = process.env.BUILD_TYPE === "release" || process.env.NODE_ENV === "production";
var enableSourcemap = !isProduction;
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [
      // 使用简化的外部化策略：只外部化真正必要的原生模块
      externalizeDepsPlugin({
        exclude: [
          // workspace 包必须打包
          "@talex-touch/utils",
          // 以下模块可以安全打包到 bundle 中
          "web-streams-polyfill",
          "formdata-polyfill",
          "node-domexception",
          "data-uri-to-buffer",
          "fetch-blob",
          "undici-types",
          "js-base64",
          "promise-limit"
        ]
      })
    ],
    build: {
      sourcemap: enableSourcemap,
      commonjsOptions: {
        // libsql chooses native binding at runtime via dynamic require
        ignoreDynamicRequires: true
      },
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
        exclude: [
          "@talex-touch/utils",
          // workspace 包需要打包
          "@electron-toolkit/preload"
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
      exclude: ["electron", "fs", "child_process", "original-fs"]
    },
    build: {
      sourcemap: enableSourcemap,
      rollupOptions: {
        external: ["electron", "fs", "child_process", "original-fs"],
        output: {
          assetFileNames: "assets/[name]-[hash][extname]",
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js"
        }
      }
    },
    plugins: [
      generatorInformation(),
      vue(),
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
      VueI18nPlugin({
        runtimeOnly: false
      }),
      sentryVitePlugin({
        org: "quotawish",
        project: "tuff"
      })
    ]
  }
});
export {
  electron_vite_config_default as default
};
