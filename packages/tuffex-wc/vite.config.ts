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
          if (normalized.includes('/src/runtime/'))
            return 'wc-runtime'
          if (normalized.includes('/src/elements/tier-a'))
            return 'tier-a'
          if (normalized.includes('/src/elements/tier-b'))
            return 'tier-b'
          if (normalized.includes('/src/elements/tier-c'))
            return 'tier-c'
          if (normalized.includes('/packages/tuffex/packages/utils/'))
            return 'tuffex-shared'
          const tuffexMatch = normalized.match(/\/packages\/tuffex\/packages\/components\/src\/([^/]+)\//)
          if (tuffexMatch) {
            const comp = tuffexMatch[1]!
            if ([
              'markdown-view',
              'stream-text',
              'thinking-indicator',
              'typing-indicator',
            ].includes(comp)) {
              return 'tier-c'
            }
            if ([
              'base-anchor',
              'card-item',
              'checkbox',
              'collapse',
              'copy-button',
              'dialog',
              'drawer',
              'input',
              'modal',
              'popover',
              'progress-bar',
              'radio',
              'search-input',
              'select',
              'slider',
              'tabs',
              'textarea',
              'tooltip',
            ].includes(comp)) {
              return 'tier-b'
            }
            if ([
              'alert',
              'avatar',
              'badge',
              'dot-indicator',
              'empty',
              'empty-state',
              'kbd',
              'no-data',
              'progress',
              'skeleton',
              'stat-card',
              'status-badge',
              'status-hint',
              'switch',
              'tag',
            ].includes(comp)) {
              return 'tier-a'
            }
            return 'tuffex-shared'
          }
          return undefined
        },
      },
    },
  },
})
