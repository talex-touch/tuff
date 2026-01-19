import { withInstall } from '../../../utils/withInstall'
import TxCornerOverlay from './src/TxCornerOverlay.vue'
import type { CornerOverlayPlacement, CornerOverlayProps } from './src/types'

export type { CornerOverlayPlacement, CornerOverlayProps }

const CornerOverlay = withInstall(TxCornerOverlay)

export { CornerOverlay, TxCornerOverlay }
export type TxCornerOverlayInstance = InstanceType<typeof TxCornerOverlay>

export default CornerOverlay
