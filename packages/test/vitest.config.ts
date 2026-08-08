import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/dist/config'

export default defineConfig({
  resolve: {
    alias: {
      // Give `electron` a single identity across this package. Test files and the
      // main-process code they import otherwise resolve the bare specifier
      // differently, which stops vi.mock('electron', ...) from ever binding.
      // See src/stubs/electron.ts for the full reasoning.
      'electron': fileURLToPath(new URL('./src/stubs/electron.ts', import.meta.url)),
      // Same reason, same fix: @sentry/electron is not resolvable from here either,
      // and the real module reads process.versions.electron at import time, which
      // kills the whole suite during collection rather than failing a test.
      '@sentry/electron/main': fileURLToPath(new URL('./src/stubs/sentry-electron-main.ts', import.meta.url)),
      // A CJS package that require()s electron at module scope. Inlining it is not
      // enough -- vite's CJS interop routes its require through Node, which never
      // consults the alias above -- so the package itself has to be aliased.
      'talex-mica-electron': fileURLToPath(new URL('./src/stubs/talex-mica-electron.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    server: {
      deps: {
        // ESM dependencies that import electron themselves. Left external they are
        // loaded by Node directly, which never sees the alias above and hands them
        // the real CommonJS electron -- so `import { BrowserWindow } from 'electron'`
        // fails as a missing named export, blaming the source file that imported the
        // package rather than the package. Inlining routes them through vite so the
        // alias applies.
        inline: ['@electron-toolkit/utils'],
      },
    },
  },
})
