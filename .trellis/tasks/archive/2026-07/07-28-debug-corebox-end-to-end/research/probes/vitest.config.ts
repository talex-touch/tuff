import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url))

export default defineConfig({
  root: repoRoot,
  test: {
    environment: 'node',
    include: ['.trellis/tasks/07-28-debug-corebox-end-to-end/research/probes/*.test.ts'],
  },
})
