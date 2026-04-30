import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#imports': fileURLToPath(new URL('./test/mocks/nuxt-imports.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'server/**/__tests__/**/*.test.ts', 'app/**/*.test.ts'],
  },
})
