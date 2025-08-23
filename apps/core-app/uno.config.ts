// uno.config.ts
import { defineConfig } from 'unocss'
import { presetUno, presetAttributify } from 'unocss'
import presetIcons from '@unocss/preset-icons'
import type { Theme } from 'unocss/preset-uno'
import presetTheme from 'unocss-preset-theme'
import transformerAttributifyJsx from '@unocss/transformer-attributify-jsx'
import ri from '@iconify-json/ri/icons.json'
import simpleIcons from '@iconify-json/simple-icons/icons.json'

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
        ri: ri as any,
        'simple-icons': simpleIcons as any
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
