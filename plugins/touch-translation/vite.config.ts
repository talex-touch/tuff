/// <reference types="vitest" />

import { fileURLToPath, URL } from 'node:url'
import TouchPluginExport from '@talex-touch/unplugin-export-plugin/vite'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import VueMacros from 'unplugin-vue-macros/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    // Vite 默认支持 History 模式，所有路由都会回退到 index.html
    // 这样可以支持 Vue Router 的 History 模式
  },
  resolve: {
    alias: {
      '~/': `${fileURLToPath(new URL('./src', import.meta.url))}/`,
    },
  },
  plugins: [
    TouchPluginExport(),

    VueMacros({
      defineOptions: false,
      defineModels: false,
      plugins: {
        vue: Vue({
          script: {
            propsDestructure: true,
            defineModel: true,
          },
        }),
      },
    }),

    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        '@vueuse/core',
      ],
      dts: true,
      // Exclude the composables barrel file to avoid duplicate hook entries
      dirs: [
        'src/composables/**/!(*index).ts',
        'src/providers/**/*.ts',
      ],
      vueTemplate: true,
    }),

    // https://github.com/antfu/vite-plugin-components
    Components({
      dts: true,
    }),

    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    UnoCSS(),
  ],

  // https://github.com/vitest-dev/vitest
  // @ts-expect-error - test is for vitest config
  test: {
    environment: 'jsdom',
  },
})
