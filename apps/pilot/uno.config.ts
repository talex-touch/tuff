import process from 'node:process'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetUno,
  presetWebFonts,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import fontCarbon from './app/constants/carbon.json'
import fontMaterialSymbol from './app/constants/material-symbols.json'

const isDev = process.env.NODE_ENV !== 'production'
const useFullIconSafelist = process.env.NUXT_FULL_ICON_SAFELIST === 'true'

export default defineConfig({
  shortcuts: [
    ['btn', 'px-4 py-1 rounded inline-block bg-teal-600 text-white cursor-pointer hover:bg-teal-700 disabled:cursor-default disabled:bg-gray-600 disabled:opacity-50'],
    ['icon-btn', 'inline-block cursor-pointer select-none opacity-75 transition duration-200 ease-in-out hover:opacity-100 hover:text-teal-600'],
  ],
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
    }),
    presetTypography({
      selectorName: 'ProseMirror',
    }),
    ...(!isDev
      ? [
          presetWebFonts({
            fonts: {
              sans: 'DM Sans',
              serif: 'DM Serif Display',
              mono: 'DM Mono',
            },
          }),
        ]
      : []),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  safelist: useFullIconSafelist ? [...fontCarbon, ...fontMaterialSymbol] : [],
})
