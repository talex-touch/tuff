import type { FlatButtonProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TuffFlatButton from './src/TxFlatButton.vue'

withInstall(TuffFlatButton)

export { TuffFlatButton }
export type { FlatButtonProps }
export type TuffFlatButtonInstance = InstanceType<typeof TuffFlatButton>
export default TuffFlatButton
