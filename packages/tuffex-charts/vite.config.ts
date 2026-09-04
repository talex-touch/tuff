import { readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
)
const externalDeps = Array.from(
  new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]),
)

export default defineConfig({
  build: {
    target: 'esnext',
    minify: false,
    // One extracted stylesheet (dist/es/style.css) instead of per-module CSS —
    // consumers import it via the "./style.css" subpath export.
    cssCodeSplit: false,
    rollupOptions: {
      // Match subpaths too (e.g. `d3-scale/...`): an exact-string external list
      // silently misses them and vendors the dependency into dist.
      external: id => externalDeps.some(dep => id === dep || id.startsWith(`${dep}/`)),
      input: { index: './src/index.ts' },
      output: [
        {
          exports: 'named',
          format: 'es',
          dir: 'dist/es',
          entryFileNames: '[name].js',
          assetFileNames: 'style.css',
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
        {
          exports: 'named',
          format: 'cjs',
          dir: 'dist/lib',
          entryFileNames: '[name].js',
          assetFileNames: 'style.css',
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
      ],
    },
    lib: {
      entry: 'src/index.ts',
    },
  },
  plugins: [
    vue(),
    dts({
      entryRoot: './src',
      outDir: 'dist/es',
      exclude: ['**/__tests__/**'],
    }),
  ],
})
