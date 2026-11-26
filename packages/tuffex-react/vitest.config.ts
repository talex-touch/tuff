import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const tuffexCoreEntry = fileURLToPath(new URL('../tuffex-core/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@talex-touch\/tuffex-core$/, replacement: tuffexCoreEntry },
    ],
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    name: 'tuffex-react',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
