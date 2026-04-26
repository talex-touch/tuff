import { fileURLToPath, URL } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '~/': `${fileURLToPath(new URL('./src', import.meta.url))}/`,
    },
  },
  plugins: [Vue()],
  test: {
    environment: 'jsdom',
  },
})
