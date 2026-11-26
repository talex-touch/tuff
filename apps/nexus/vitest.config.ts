import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const tuffexDistUtilsInternal = fileURLToPath(new URL('../../packages/tuffex/dist/es/utils/internal', import.meta.url))
const tuffexSourceUtilsRoot = fileURLToPath(new URL('../../packages/tuffex/packages/utils', import.meta.url))
const tuffexUtilsSubpathReplacement = existsSync(`${tuffexDistUtilsInternal}/form-host.js`)
  ? `${tuffexDistUtilsInternal}/$1.js`
  : `${tuffexSourceUtilsRoot}/$1.ts`
const tuffexCoreCompatDist = fileURLToPath(new URL('../../packages/tuffex-core/dist/compat-registry.js', import.meta.url))
const tuffexCoreCompatSource = fileURLToPath(new URL('../../packages/tuffex-core/src/compat-registry.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@talex-touch\/tuffex\/utils\/(.+)$/, replacement: tuffexUtilsSubpathReplacement },
      ...(!existsSync(tuffexCoreCompatDist)
        ? [{ find: /^@talex-touch\/tuffex-core\/compat$/, replacement: tuffexCoreCompatSource }]
        : []),
      { find: '#imports', replacement: fileURLToPath(new URL('./test/mocks/nuxt-imports.ts', import.meta.url)) },
      { find: '#shared', replacement: fileURLToPath(new URL('./shared', import.meta.url)) },
      { find: '~', replacement: fileURLToPath(new URL('./app', import.meta.url)) },
    ],
  },
  test: {
    environment: 'node',
    // `scripts/` was never in this list -- there was nothing under it to run. The deployed-preview
    // collector is plain `.mjs`, so its test is too, and the pattern matches that rather than
    // forcing a `.ts` wrapper around a JavaScript module.
    include: ['server/**/*.test.ts', 'server/**/__tests__/**/*.test.ts', 'app/**/*.test.ts', 'shared/**/*.test.ts', 'build/**/*.test.ts', 'test/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
