import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'core-box/**/*.ts',
        'search/**/*.ts',
        'transport/**/*.ts'
      ],
      exclude: [
        '**/*.d.ts',
        '**/index.ts',
        '**/types.ts'
      ]
    }
  }
})