import type {
  IconPickerCatalogSection,
  IconPickerEmits,
  IconPickerEntry,
  IconPickerFileChooser,
  IconPickerLabels,
  IconPickerProps,
  IconPickerSection,
  IconPickerShape,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxIconPicker from './src/TxIconPicker.vue'
import TxIconPickerPanel from './src/TxIconPickerPanel.vue'

/**
 * TxIconPicker — pick an icon from bundled emoji, icon, brand and AI catalogs,
 * or from a local file, and get back one identifier string.
 *
 * @example
 * ```ts
 * import { TxIconPicker } from '@talex-touch/tuffex'
 *
 * // <TxIconPicker v-model="identifier" v-model:shape="shape" :file-chooser="pickPath" />
 * // identifier: 'class:i-ri-rocket-line' | 'emoji:🚀' | 'file:/Users/me/a.png'
 * ```
 *
 * The picker draws the bundled classes from its own path data, so it needs no
 * icon CSS from the host. A picked class shown *outside* the picker is just a
 * class, though: render it through `TxIcon` under a config whose
 * `classGlyph` is `resolveIconPickerGlyph`, or safelist
 * `ICON_CATALOG_CLASSES` in the host's utility-CSS engine.
 *
 * @public
 */
const IconPicker = withInstall(TxIconPicker)

export {
  AI_CATALOG,
  BRAND_CATALOG,
  EMOJI_CATALOG,
  ICON_CATALOG,
  ICON_CATALOG_CLASSES,
  ICON_PICKER_CATEGORY_LABELS,
} from './src/catalog'
export { loadIconPickerGlyphs, provideIconPickerGlyphs, resolveIconPickerGlyph } from './src/glyphs'
export { formatIconIdentifier, parseIconIdentifier } from './src/identifier'
export { ICON_PICKER_SHAPE_PATHS, ICON_PICKER_SHAPES, isIconPickerShape } from './src/shapes'
export { IconPicker, TxIconPicker, TxIconPickerPanel }
export type {
  IconPickerCatalogSection,
  IconPickerEmits,
  IconPickerEntry,
  IconPickerFileChooser,
  IconPickerLabels,
  IconPickerProps,
  IconPickerSection,
  IconPickerShape,
}
export type { TxCustomEmoji, TxEmojiPack } from '../icon/src/emoji-pack'
export type TxIconPickerInstance = InstanceType<typeof TxIconPicker>

export default IconPicker
