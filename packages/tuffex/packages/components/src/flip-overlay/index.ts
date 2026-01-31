import type { FlipOverlayEmits, FlipOverlayProps, FlipOverlaySlotProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxFlipOverlay from './src/TxFlipOverlay.vue'

const FlipOverlay = withInstall(TxFlipOverlay)

export { FlipOverlay, TxFlipOverlay }
export type { FlipOverlayEmits, FlipOverlayProps, FlipOverlaySlotProps }
export type TxFlipOverlayInstance = InstanceType<typeof TxFlipOverlay> & { close: () => void }

export default FlipOverlay
