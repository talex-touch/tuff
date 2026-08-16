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

    plugins,
  }

  return config
})
