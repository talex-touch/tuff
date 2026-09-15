import type {
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
 * TxIconPicker — pick an icon from bundled emoji, general and brand catalogs,
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
 * Hosts on a utility-CSS engine must safelist `ICON_CATALOG_CLASSES`: the
 * bundled classes appear in no scanned template, so without it every glyph
 * renders as an empty box.
 *
 * @public
 */
const IconPicker = withInstall(TxIconPicker)

export {
  BRAND_CATALOG,
  EMOJI_CATALOG,
  ICON_CATALOG,
  ICON_CATALOG_CLASSES,
} from './src/catalog'
export { formatIconIdentifier, parseIconIdentifier } from './src/identifier'
export { IconPicker, TxIconPicker, TxIconPickerPanel }
export type {
  IconPickerEmits,
  IconPickerEntry,
  IconPickerFileChooser,
  IconPickerLabels,
  IconPickerProps,
  IconPickerSection,
  IconPickerShape,
}
export type TxIconPickerInstance = InstanceType<typeof TxIconPicker>

export default IconPicker
