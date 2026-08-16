import type { SignalMeterProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxSignalMeter from './src/TxSignalMeter.vue'

/**
 * TxSignalMeter — segmented strength meter (confidence, relevance, signal).
 *
 * Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
 *
 * @example
 * ```ts
 * import { TxSignalMeter } from '@talex-touch/tuffex'
 *
 * // Use in template
 * <TxSignalMeter :value="3" tone="var(--tx-bui-green)" label="High confidence" />
 * ```
 *
 * @public
 */
const SignalMeter = withInstall(TxSignalMeter)

export { SignalMeter, TxSignalMeter }
export type { SignalMeterProps }
export type TxSignalMeterInstance = InstanceType<typeof TxSignalMeter>

export default SignalMeter
