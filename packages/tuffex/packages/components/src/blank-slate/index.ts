import type { BlankSlateProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxBlankSlate.vue'

const TxBlankSlate = withInstall(component)

export { TxBlankSlate }
export type { BlankSlateProps }
export type TxBlankSlateInstance = InstanceType<typeof component>

export default TxBlankSlate
