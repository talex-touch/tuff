import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: {
        'index': resolve(rootDir, 'src/index.ts'),
        'react': resolve(rootDir, 'src/react.ts'),
        'wc': resolve(rootDir, 'src/wc.ts'),
        'compat-registry': resolve(rootDir, 'src/compat-registry.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        '@vue/reactivity',
        '@floating-ui/dom',
        'react',
        /^react\//,
      ],
      output: {
        preserveModules: false,
      },
    },
  },
  plugins: [
    dts({
      entryRoot: resolve(rootDir, 'src'),
      outDir: resolve(rootDir, 'dist'),
      tsconfigPath: resolve(rootDir, 'tsconfig.json'),
      include: [resolve(rootDir, 'src/**/*.ts'), resolve(rootDir, 'types/**/*.d.ts')],
      exclude: [resolve(rootDir, '__tests__/**')],
      beforeWriteFile(filePath, content) {
        if (filePath.includes('react-shim'))
          return false
        return { filePath, content }
      },
    }),
  ],
})
