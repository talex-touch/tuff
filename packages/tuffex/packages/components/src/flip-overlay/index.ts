import type { FlipOverlayEmits, FlipOverlayProps, FlipOverlaySlotProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxFlipOverlayComponent from './src/TxFlipOverlay.vue'

const FlipOverlay = withInstall(TxFlipOverlayComponent)

export { FlipOverlay, TxFlipOverlayComponent as TxFlipOverlay }
export type { FlipOverlayEmits, FlipOverlayProps, FlipOverlaySlotProps }
export type TxFlipOverlayInstance = InstanceType<typeof TxFlipOverlayComponent> & { close: () => void }

export default FlipOverlay
