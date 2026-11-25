import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const tuffexSrcDir = fileURLToPath(new URL('../tuffex/packages/components/src', import.meta.url))
const tuffexStyleDir = fileURLToPath(new URL('../tuffex/packages/components/style', import.meta.url))
const utilsDir = fileURLToPath(new URL('../utils', import.meta.url))
const localNodeModulesDir = fileURLToPath(new URL('./node_modules', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: '@tuffex-src', replacement: tuffexSrcDir },
      { find: '@tuffex-style', replacement: tuffexStyleDir },
      { find: '@talex-touch/utils', replacement: utilsDir },
      { find: 'vue', replacement: `${localNodeModulesDir}/vue` },
      { find: '@floating-ui/vue', replacement: `${localNodeModulesDir}/@floating-ui/vue` },
      { find: 'dompurify', replacement: `${localNodeModulesDir}/dompurify` },
      { find: 'gsap', replacement: `${localNodeModulesDir}/gsap` },
      { find: 'marked', replacement: `${localNodeModulesDir}/marked` },
      { find: 'v-wave', replacement: `${localNodeModulesDir}/v-wave` },
    ],
  },
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
