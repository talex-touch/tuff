import { fileURLToPath } from 'node:url'
import carbonIcons from '@iconify-json/carbon/icons.json'
import ri from '@iconify-json/ri/icons.json'
import simpleIcons from '@iconify-json/simple-icons/icons.json'
import type { IconifyJSON } from '@iconify/types'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno,
  transformerAttributifyJsx
} from 'unocss'
import { MODEL_FAMILY_ICON_CLASSES } from './src/renderer/src/modules/intelligence/model-family-icons'
import { MODEL_SOURCE_ICON_CLASSES } from './src/renderer/src/modules/intelligence/model-source-icons'
import {
  PROVIDER_ICON_CLASSES,
  PROVIDER_ID_ICON_CLASSES
} from './src/renderer/src/modules/intelligence/provider-icons'

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

/**
 * The safelist sources that are modules rather than literals. Absolute, because `configDeps`
 * resolves against the Vite root (`src/renderer` under electron-vite), not against this file.
 */
const PROVIDER_ICONS_MODULE = fileURLToPath(
  new URL('./src/renderer/src/modules/intelligence/provider-icons.ts', import.meta.url)
)
const MODEL_FAMILY_ICONS_MODULE = fileURLToPath(
  new URL('./src/renderer/src/modules/intelligence/model-family-icons.ts', import.meta.url)
)
const MODEL_SOURCE_ICONS_MODULE = fileURLToPath(
  new URL('./src/renderer/src/modules/intelligence/model-source-icons.ts', import.meta.url)
)

export default defineConfig({
  // The dev server watches only the config file itself. Without this, a new icon in the table
  // would stay an empty box until the next restart, which is the same defect one step removed.
  configDeps: [PROVIDER_ICONS_MODULE, MODEL_FAMILY_ICONS_MODULE, MODEL_SOURCE_ICONS_MODULE],
  safelist: [
    ...COREBOX_ACTION_ICONS,
    ...SETTINGS_CATEGORY_ICONS,
    // AI provider icons: the same trap, in `renderer/src/modules/intelligence/provider-icons.ts`.
    // Imported rather than copied so the list cannot drift; that module has only type-level
    // imports, so the config loader can evaluate it.
    ...PROVIDER_ICON_CLASSES,
    ...PROVIDER_ID_ICON_CLASSES,
    // Model family icons — the brand mark a row shows for `qwen2.5:3b` or `codex/gpt-6-astra` —
    // from `renderer/src/modules/intelligence/model-family-icons.ts`; same trap, same wiring.
    ...MODEL_FAMILY_ICON_CLASSES,
    // Channel icons — the brand mark a filter tab and a group header show for the `codex` or
    // `ollama` a model was listed under; `renderer/src/modules/intelligence/model-source-icons.ts`.
    // Channels the table cannot place draw an initial instead, which needs no class.
    ...MODEL_SOURCE_ICON_CLASSES
  ],
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
