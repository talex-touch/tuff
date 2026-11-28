import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const tuffexSrcDir = fileURLToPath(new URL('../tuffex/packages/components/src', import.meta.url))
const tuffexStyleDir = fileURLToPath(new URL('../tuffex/packages/components/style', import.meta.url))
const utilsDir = fileURLToPath(new URL('../utils', import.meta.url))

const externalDeps = [
  'vue',
  '@vue/reactivity',
  '@vue/runtime-core',
  '@vue/runtime-dom',
  '@vue/shared',
  '@floating-ui/vue',
  '@talex-touch/tuffex-core',
  '@talex-touch/utils',
  'dompurify',
  'gsap',
  'marked',
]

const TUFFEX_WC_MEDIA_COMPONENTS = new Set([
  'avatar',
  'file-uploader',
  'icon-morph',
  'icon-picker',
  'image-gallery',
  'image-preview',
  'image-uploader',
])

const TUFFEX_WC_DATA_COMPONENTS = new Set([
  'cascader',
  'data-table',
  'date-picker',
  'descriptions',
  'drawer-form',
  'form',
  'modal-form',
  'picker',
  'sortable-list',
  'steps',
  'steps-form',
  'timeline',
  'transfer',
  'tree',
  'tree-select',
])

const TUFFEX_WC_EXTRAS_COMPONENTS = new Set([
  'ai-elements',
  'alert',
  'badge',
  'breadcrumb',
  'collapse',
  'container',
  'context-menu',
  'dialog',
  'filter-chips',
  'flat-dropdown',
  'flat-select',
  'grid',
  'grid-layout',
  'group-block',
  'inline-citation',
  'markdown-view',
  'nav-bar',
  'pagination',
  'progress',
  'progress-bar',
  'radio',
  'rating',
  'scrub-field',
  'search-select',
  'segmented-slider',
  'selection-actions',
  'sensitive-input',
  'sidebar-nav',
  'slider',
  'splitter',
  'stat-card',
  'status-badge',
  'status-hint',
  'stream-text',
  'tab-bar',
  'tabs',
  'tag-input',
  'textarea',
  'toast',
  'toast-panel',
])

export default defineConfig({
  resolve: {
    alias: [
      { find: '@tuffex-src', replacement: tuffexSrcDir },
      { find: '@tuffex-style', replacement: tuffexStyleDir },
      { find: '@talex-touch/utils', replacement: utilsDir },
    ],
  },
  plugins: [
    vue(),
    dts({
      entryRoot: './src',
      outDir: './dist',
      tsconfigPath: './tsconfig.json',
      include: ['src/**/*.ts', 'src/**/*.d.ts'],
      exclude: ['src/**/__tests__/**'],
      pathsToAliases: false,
      compilerOptions: {
        skipLibCheck: true,
      },
    }),
  ],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    cssMinify: true,
    cssCodeSplit: false,
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        manifest: fileURLToPath(new URL('./src/manifest.ts', import.meta.url)),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: 'style',
    },
    rollupOptions: {
      external: (id) => {
        if (/\.css(?:\?|$)/.test(id))
          return false
        return externalDeps.some(dep => id === dep || id.startsWith(`${dep}/`))
      },
      output: {
        chunkFileNames: 'chunks/[name].js',
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          // Isolate Vue SFC & Vite virtual helpers into zero-dependency leaf chunks
          // so Rollup can never create circular chunk TDZ on `_export_sfc`.
          if (normalized.includes('plugin-vue:export-helper'))
            return 'vue-export-helper'
          if (normalized.includes('vite/preload-helper'))
            return 'vite-preload-helper'
          if (normalized.includes('/src/runtime/'))
            return 'wc-runtime'
          if (normalized.includes('/src/elements/tier-a'))
            return 'tier-a'
          if (normalized.includes('/src/elements/tier-b'))
            return 'tier-b'
          if (normalized.includes('/src/elements/tier-c'))
            return 'tier-c'
          if (normalized.includes('/src/elements/base-a'))
            return 'base-a'
          if (normalized.includes('/src/elements/base-b'))
            return 'base-b'
          // Keep dynamically imported icon-picker glyph tables & lazy image-generation effects on-demand
          if (
            normalized.includes('/packages/tuffex/packages/components/src/icon-picker/src/generated/')
            || normalized.includes('/packages/tuffex/packages/components/src/image-generation/')
          ) {
            return undefined
          }
          // Partition TuffEx Vue components into strictly cycle-free layered chunks so
          // each chunk stays comfortably under Nexus's 600 KB client chunk budget and
          // element wrappers (`tier-*` / `base-*`) import them strictly one-way.
          const tuffexCompMatch = normalized.match(/\/packages\/tuffex\/packages\/components\/src\/([^/]+)\//)
          if (tuffexCompMatch) {
            const comp = tuffexCompMatch[1]!
            if (TUFFEX_WC_MEDIA_COMPONENTS.has(comp))
              return 'tuffex-media'
            if (TUFFEX_WC_DATA_COMPONENTS.has(comp))
              return 'tuffex-data'
            if (TUFFEX_WC_EXTRAS_COMPONENTS.has(comp))
              return 'tuffex-extras'
            return 'tuffex-shared'
          }
          if (normalized.includes('/packages/tuffex/packages/utils/'))
            return 'tuffex-shared'
          return undefined
        },
      },
    },
  },
})
