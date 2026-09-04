import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#imports': fileURLToPath(new URL('./test/mocks/nuxt-imports.ts', import.meta.url)),
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // `scripts/` was never in this list -- there was nothing under it to run. The deployed-preview
    // collector is plain `.mjs`, so its test is too, and the pattern matches that rather than
    // forcing a `.ts` wrapper around a JavaScript module.
    include: ['server/**/*.test.ts', 'server/**/__tests__/**/*.test.ts', 'app/**/*.test.ts', 'build/**/*.test.ts', 'test/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
