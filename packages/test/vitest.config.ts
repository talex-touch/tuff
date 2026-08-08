import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/dist/config'

export default defineConfig({
  resolve: {
    alias: {
      // Give `electron` a single identity across this package. Test files and the
      // main-process code they import otherwise resolve the bare specifier
      // differently, which stops vi.mock('electron', ...) from ever binding.
      // See src/stubs/electron.ts for the full reasoning.
      electron: fileURLToPath(new URL('./src/stubs/electron.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
