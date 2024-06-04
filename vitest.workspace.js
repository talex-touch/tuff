import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  "./plugins/touch-image/vite.config.ts",
  "./plugins/touch-music/vite.config.js",
  "./plugins/touch-translation/vite.config.ts",
  "./app/core/vite.config.ts",
  "./packages/touch-view/vite.config.ts",
  "./packages/test/vitest.config.ts"
])
