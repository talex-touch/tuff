import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
  ],
  server: {
    host: '127.0.0.1',
    port: 3416,
  },
  preview: {
    host: '127.0.0.1',
    port: 3417,
  },
  resolve: {
    alias: {
      '@talex-touch/tuffex/base.css': fileURLToPath(new URL('../tuffex/dist/es/base.css', import.meta.url)),
    },
  },
})
