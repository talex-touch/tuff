import carbonIcons from '@iconify-json/carbon/icons.json'
import ri from '@iconify-json/ri/icons.json'
import simpleIcons from '@iconify-json/simple-icons/icons.json'
import type { IconifyJSON } from '@iconify/types'
import presetIcons from '@unocss/preset-icons'
// import type { Theme } from 'unocss/preset-uno'
// import presetTheme from 'unocss-preset-theme'
import transformerAttributifyJsx from '@unocss/transformer-attributify-jsx'
// uno.config.ts
import { defineConfig } from 'unocss'
import { presetAttributify, presetUno } from 'unocss'

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
        ri: ri as IconifyJSON,
        'simple-icons': simpleIcons as IconifyJSON,
        carbon: carbonIcons as IconifyJSON
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
