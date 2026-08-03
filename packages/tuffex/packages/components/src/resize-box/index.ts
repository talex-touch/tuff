import type { ResizeBoxProps, ResizeBoxSize } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxResizeBox from './src/TxResizeBox.vue'

const ResizeBox = withInstall(TxResizeBox)

export { ResizeBox, TxResizeBox }
export type { ResizeBoxProps, ResizeBoxSize }
export type TxResizeBoxInstance = InstanceType<typeof TxResizeBox>

export default ResizeBox
