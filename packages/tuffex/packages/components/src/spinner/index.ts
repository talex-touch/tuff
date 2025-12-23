import TxSpinner from './src/TxSpinner.vue'
import { withInstall } from '../../../utils/withInstall'
import type { SpinnerProps } from './src/types.ts'

const Spinner = withInstall(TxSpinner)

export { Spinner, TxSpinner }
export type { SpinnerProps }
export type TxSpinnerInstance = InstanceType<typeof TxSpinner>

export default Spinner
