import type { SpinnerProps } from './src/types.ts'
import { withInstall } from '../../../utils/withInstall'
import TxSpinner from './src/TxSpinner.vue'

const Spinner = withInstall(TxSpinner)

export { Spinner, TxSpinner }
export type { SpinnerProps }
export type TxSpinnerInstance = InstanceType<typeof TxSpinner>

export default Spinner
