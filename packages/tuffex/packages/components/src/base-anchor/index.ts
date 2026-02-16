import type { BaseAnchorProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxBaseAnchor from './src/TxBaseAnchor.vue'

const BaseAnchor = withInstall(TxBaseAnchor)

export { BaseAnchor, TxBaseAnchor }
export type { BaseAnchorProps }
export type TxBaseAnchorInstance = InstanceType<typeof TxBaseAnchor>

export default BaseAnchor
