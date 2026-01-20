import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['packages/components/src/**/__tests__/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'utils',
          environment: 'node',
          include: ['packages/utils/__tests__/**/*.test.ts'],
        },
      },
    ],
  },
})
