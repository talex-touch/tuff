// uno.config.ts
import { defineConfig } from 'unocss'
import { presetUno, presetAttributify } from 'unocss'
import presetIcons from '@unocss/preset-icons'
import type { Theme } from 'unocss/preset-uno'
import presetTheme from 'unocss-preset-theme'
import transformerAttributifyJsx from '@unocss/transformer-attributify-jsx'

export default defineConfig({
  theme: {
    colors: {
      brand: {
        primary: '#0c23ff'
      }
    }
  },
  presets: [
    presetUno({
      dark: {
        dark: '.dark'
      }
    }),
    presetAttributify(),
    presetIcons({
      collections: {
        ri: () => import('@iconify-json/ri/icons.json').then((i) => i.default),
        'simple-icons': () => import('@iconify-json/simple-icons/icons.json').then((i) => i.default)
      }
    })
    // presetTheme<Theme>({
    //   theme: {
    //     dark: {
    //
    //     },
    //     compact: {
    //
    //     }
    //   }
    // }),
  ],
  transformers: [transformerAttributifyJsx()]
})
