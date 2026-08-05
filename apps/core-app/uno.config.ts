import carbonIcons from '@iconify-json/carbon/icons.json'
import ri from '@iconify-json/ri/icons.json'
import simpleIcons from '@iconify-json/simple-icons/icons.json'
import type { IconifyJSON } from '@iconify/types'
import presetIcons from '@unocss/preset-icons'
import transformerAttributifyJsx from '@unocss/transformer-attributify-jsx'
import { defineConfig } from 'unocss'
import { presetAttributify, presetUno } from 'unocss'

/**
 * Icon classes that only ever appear inside plain `.ts` modules.
 *
 * UnoCSS's default extraction pipeline covers `.vue`, `.jsx`/`.tsx` and templates — not `.ts` —
 * so a class named only in a TypeScript table is never generated, and the element renders with
 * no glyph at all. Listing them here is the fix; the alternative, scanning every `.ts`, pulls in
 * unrelated string literals.
 */
const COREBOX_ACTION_ICONS = [
  'i-carbon-ibm-watsonx-code-assistant-for-z-validation-assistant',
  'i-carbon-package-node',
  'i-carbon-app',
  'i-carbon-folders',
  'i-ri-apps-line'
]

/** Sidebar icons from `renderer/src/modules/settings/categories.ts`. */
const SETTINGS_CATEGORY_ICONS = [
  'i-ri-dashboard-3-line',
  'i-ri-settings-3-line',
  'i-ri-palette-line',
  'i-ri-sparkling-2-line',
  'i-ri-puzzle-line',
  'i-ri-file-search-line',
  'i-ri-refresh-line',
  'i-ri-global-line',
  'i-ri-download-2-line',
  'i-ri-hard-drive-2-line',
  'i-ri-information-line'
]

export default defineConfig({
  safelist: [...COREBOX_ACTION_ICONS, ...SETTINGS_CATEGORY_ICONS],
  theme: {
    colors: {
      brand: {
        primary: '#409eff'
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
  ],
  transformers: [transformerAttributifyJsx()]
})
