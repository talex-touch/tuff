import { existsSync, realpathSync, readdirSync, readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { fileURLToPath } from 'node:url'

function isLegalCssComment(text) {
  const normalized = text.trim()
  return normalized.startsWith('!') || /@license|copyright/i.test(normalized)
}

export function createLegalCommentPreservingStripper() {
  return {
    postcssPlugin: 'tuffex-strip-nonlegal-comments',
    Once(root) {
      root.walkComments(comment => {
        if (!isLegalCssComment(comment.text)) comment.remove()
      })
    }
  }
}

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
)
// The gulp build points this at its staging directory and swaps that over dist
// once every step has passed (packages/script/build/index.ts); a `vite build`
// run on its own writes straight to dist.
const distRoot = process.env.TUFFEX_DIST_DIR || fileURLToPath(new URL('../../dist', import.meta.url))
const externalDeps = Array.from(
  new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {})
  ])
)
// Every directory under src/ was treated as a component and required to have an
// index.ts, so adding any non-component directory (a shared __tests__ folder,
// for example) broke the whole build with an unresolved-entry error. Only take
// directories that actually expose an entry.
const componentEntries = Object.fromEntries(
  readdirSync(new URL('./src', import.meta.url), { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'utils')
    .filter(dirent => existsSync(new URL(`./src/${dirent.name}/index.ts`, import.meta.url)))
    .map(dirent => [`${dirent.name}/index`, `./src/${dirent.name}/index.ts`])
)

// Shared utilities live outside preserveModulesRoot. Keep their module paths
// package-relative instead of shipping the absolute build-worktree directory,
// and list them as explicit Rollup inputs so pure re-exports from external
// `@talex-touch/tuffex-core` are never elided from `dist/es/utils/internal/*`.
const utilsSourceRoot = realpathSync(fileURLToPath(new URL('../utils/', import.meta.url))).replaceAll('\\', '/')
function collectUtilEntries(dirUrl, prefix = '') {
  const entries = {}
  for (const dirent of readdirSync(dirUrl, { withFileTypes: true })) {
    if (dirent.isDirectory()) {
      if (dirent.name === '__tests__')
        continue
      Object.assign(
        entries,
        collectUtilEntries(new URL(`${dirent.name}/`, dirUrl), `${prefix}${dirent.name}/`),
      )
      continue
    }
    if (!dirent.name.endsWith('.ts') || dirent.name.endsWith('.d.ts'))
      continue
    const rel = `${prefix}${dirent.name}`
    if (rel === 'index.ts')
      continue
    const key = `utils/internal/${rel.replace(/\.ts$/, '')}`
    entries[key] = fileURLToPath(new URL(dirent.name, dirUrl))
  }
  return entries
}
const utilInternalEntries = collectUtilEntries(new URL('../utils/', import.meta.url))
function componentModuleFileName(chunk) {
  const id = chunk.facadeModuleId?.replaceAll('\\', '/')
  if (id?.startsWith(`${utilsSourceRoot}/`)) {
    const name = id.slice(utilsSourceRoot.length + 1).replace(/\.[cm]?[jt]sx?$/, '')
    return `utils/internal/${name}.js`
  }
  return '[name].js'
}

const deviceMockupSubpathEntries = {
  'device-mockup/presets/index': './src/device-mockup/presets/index.ts',
  'device-mockup/presets/ios/index': './src/device-mockup/presets/ios/index.ts',
  'device-mockup/presets/android/index': './src/device-mockup/presets/android/index.ts',
  'device-mockup/presets/tablet/index': './src/device-mockup/presets/tablet/index.ts',
  'device-mockup/presets/desktop/index': './src/device-mockup/presets/desktop/index.ts',
  'device-mockup/presets/watch/index': './src/device-mockup/presets/watch/index.ts',
  'device-mockup/presets/browser/index': './src/device-mockup/presets/browser/index.ts',
  'device-mockup/scenes/index': './src/device-mockup/scenes/index.ts',
  'device-mockup/export/index': './src/device-mockup/export/index.ts',
}

export default defineConfig({
  css: {
    postcss: {
      plugins: [createLegalCommentPreservingStripper()]
    }
  },
  build: {
    target: 'esnext',
    outDir: 'es',
    emptyOutDir: false,
    // JS stays unminified on purpose: consumers bundle and minify it themselves,
    // and readable output is what makes this package debuggable in a dependent's
    // node_modules. CSS gets none of that treatment — nobody tree-shakes a
    // stylesheet, and shipping it with the indentation still in was costing 13%
    // of every byte a consumer downloads.
    minify: false,
    cssMinify: true,
    rollupOptions: {
      // Match subpaths too: sources import '@talex-touch/utils/env', and an
      // exact-string external list silently misses that, vendoring the
      // dependency's source into dist under a node_modules/.pnpm/... path.
      // Dependency styles (including Vue style-src requests) belong in the
      // extracted component CSS, never in a published JavaScript import.
      external: id => !/\.css(?:\?|$)/.test(id)
        && externalDeps.some(dep => id === dep || id.startsWith(`${dep}/`)),
      input: {
        index: './src/index.ts',
        'utils/index': './src/utils/index.ts',
        ...utilInternalEntries,
        ...componentEntries,
        ...deviceMockupSubpathEntries,
      },
      output: [
        {
          exports: 'named',
          format: 'es',
          dir: `${distRoot}/es`,
          entryFileNames: componentModuleFileName,
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
        {
          exports: 'named',
          format: 'cjs',
          dir: `${distRoot}/lib`,
          entryFileNames: componentModuleFileName,
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
        // 开启umd打包模式
        // {
        //   name: 'vuecomp',
        //   exports: 'named',
        //   format: 'umd',
        //   dir: '../../dist/umd',
        //   entryFileNames: '[name].js',
        // }
      ],
    },
    lib: {
      entry: 'src/index.ts',
      name: 'vuecomp',
      // The extracted CSS bundle is named `<cssFileName>.css`, defaulting to the
      // package.json name's last segment. The export map, dist/style.css shim and
      // audit:size all expect components.css, so pin it instead of letting the
      // package name (now @talex-touch/tuffex-components) leak into the artifact.
      cssFileName: 'components',
      // No `formats`: `rollupOptions.output` above is already an array and owns
      // the es/cjs outputs, so Vite ignores this key and warns. Listing 'umd'
      // here was doubly misleading — the umd output block is commented out.
    },
  },
  plugins: [
    vue(),
    dts({
      entryRoot: './src',
      outDir: `${distRoot}/es`,
    }),
  ],
})
