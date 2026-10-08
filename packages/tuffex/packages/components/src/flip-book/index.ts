import { withInstall } from '../../../utils/withInstall'
import TxFlipBookComponent from './src/TxFlipBook.vue'

const FlipBook = withInstall(TxFlipBookComponent)
export { FlipBook, TxFlipBookComponent as TxFlipBook }
export type { FlipBookEmits, FlipBookLabels, FlipBookPage, FlipBookProps, FlipBookSettings, FlipBookSlotProps } from './src/types'
export type TxFlipBookInstance = InstanceType<typeof TxFlipBookComponent>
export default FlipBook
