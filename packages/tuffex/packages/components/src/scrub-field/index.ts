// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import { withInstall } from '../../../utils/withInstall'
import TxScrubField from './src/TxScrubField.vue'

/**
 * TxScrubField — a compact numeric field whose caption is a drag handle:
 * scrub it sideways, step it with the arrow keys, or type the number.
 *
 * Deliberately not a `TxSlider` variant — a slider maps a pointer position onto
 * a track, this maps pointer *travel* onto steps and has no track at all.
 *
 * @example
 * ```ts
 * import { TxScrubField } from '@talex-touch/tuffex'
 *
 * // <TxScrubField v-model="opacity" label="Opacity" :min="0" :max="100" suffix="%" />
 * ```
 *
 * @public
 */
const ScrubField = withInstall(TxScrubField)

export { ScrubField, TxScrubField }
export type { ScrubFieldEmits, ScrubFieldProps } from './src/types'
export type TxScrubFieldInstance = InstanceType<typeof TxScrubField>

export default ScrubField
