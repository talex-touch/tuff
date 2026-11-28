import { fileURLToPath, URL } from 'node:url'
import { tuffexOnDemandStylePlugin } from '@talex-touch/tuffex/vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  plugins: [
    vue(),
    UnoCSS(),
    tuffexOnDemandStylePlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: '_console',
    sourcemap: false,
    cssCodeSplit: true,
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    port: 3420,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 3421,
  },
})
