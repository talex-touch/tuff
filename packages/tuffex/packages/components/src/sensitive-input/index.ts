import type {
  SensitiveInputEmits,
  SensitiveInputLabels,
  SensitiveInputMode,
  SensitiveInputProps,
  SensitiveInputSize,
  SensitiveInputStatus,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxSensitiveInput from './src/TxSensitiveInput.vue'

/**
 * TxSensitiveInput — a field for API keys, tokens and other secrets. The value
 * is masked until the user asks for it, and a copy tab lets them take it
 * without ever revealing it on screen.
 *
 * @example
 * ```ts
 * import { TxSensitiveInput } from '@talex-touch/tuffex'
 *
 * // <TxSensitiveInput v-model="apiKey" label="API Key" />
 * ```
 *
 * Copying uses `navigator.clipboard` with a hidden-textarea fallback, so it
 * works on insecure origins; a denied clipboard emits `copy-error` rather than
 * failing silently.
 *
 * @public
 */
const SensitiveInput = withInstall(TxSensitiveInput)

export { SENSITIVE_INPUT_DEFAULT_LABELS } from './src/types'
export { SensitiveInput, TxSensitiveInput }
export type {
  SensitiveInputEmits,
  SensitiveInputLabels,
  SensitiveInputMode,
  SensitiveInputProps,
  SensitiveInputSize,
  SensitiveInputStatus,
}
export type TxSensitiveInputInstance = InstanceType<typeof TxSensitiveInput>

export default SensitiveInput
