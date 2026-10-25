import type { PluginOption, UserConfig } from 'vite'
import path from 'node:path'
import TouchPluginExport from '@talex-touch/unplugin-export-plugin/vite'
import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import VueRouter from 'unplugin-vue-router/vite'
import { defineConfig } from 'vite'
import Layouts from 'vite-plugin-vue-layouts'

/**
 * This plugin Surface was scaffolded from the Vitesse template, which wires up markdown
 * rendering, Shiki highlighting, PWA service workers and sitemap generation. A CoreBox
 * Surface is a single embedded route with no markdown content, no install prompt and no
 * crawler, so all of that is removed here — it only inflated the bundle and the dependency
 * surface that has to be kept current.
 */
export default defineConfig(async ({ command }) => {
  const isBuild = command === 'build'
  const plugins: PluginOption[] = [
    TouchPluginExport(),

    // https://github.com/posva/unplugin-vue-router
    VueRouter({
      dts: 'src/typed-router.d.ts',
    }),

    Vue(),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts(),

    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      include: [/\.[jt]sx?$/, /\.vue$/, /\.vue\?vue/],
      imports: [
        'vue',
        '@vueuse/core',
        VueRouterAutoImports,
        {
          'vue-router/auto': ['useLink'],
        },
      ],
      dts: 'src/auto-imports.d.ts',
      dirs: [
        'src/composables',
      ],
      vueTemplate: true,
    }),

    // https://github.com/antfu/unplugin-vue-components
    Components({
      dts: 'src/components.d.ts',
    }),

    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),
  ]

  if (!isBuild) {
    const { default: VueDevTools } = await import('vite-plugin-vue-devtools')
    plugins.push(VueDevTools())
  }

  const config: UserConfig = {
    base: './',
    resolve: {
      alias: {
        '~/': `${path.resolve(__dirname, 'src')}/`,
      },
    },

    // Optimize Monaco Editor
    optimizeDeps: {
      include: ['monaco-editor'],
    },

    build: {
      rollupOptions: {
        output: {
          // `security-waivers.json` pins three built files by sha256, so they must not change
          // when unrelated code does. A chunk embeds the hashed file names of the chunks it
          // imports: Monaco's core used to import Vite's preload helper from the app's entry
          // chunk, and the eval code sat in the JSON page's chunk, so any edit to the plugin
          // re-hashed both. In chunks of their own, each changes only with its own code.
          manualChunks(id) {
            if (id.includes('vite/preload-helper'))
              return 'preload-helper'
            if (id.endsWith('/src/utils/expression-eval.ts'))
              return 'expression-eval'
          },
        },
      },
    },

    plugins,
  }

  return config
})
