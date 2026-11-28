import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      { find: '#shared', replacement: fileURLToPath(new URL('./shared', import.meta.url)) },
      { find: '@talex-touch/tuff-business', replacement: fileURLToPath(new URL('../../packages/tuff-business/src/index.ts', import.meta.url)) },
      { find: 'nitropack/runtime', replacement: fileURLToPath(new URL('./test/mocks/nitro-runtime.ts', import.meta.url)) },
    ],
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'test/**/*.test.ts'],
  },
})
