import { withInstall } from '../../../utils/withInstall'
import TxCardSpreadComponent from './src/TxCardSpread.vue'

const CardSpread = withInstall(TxCardSpreadComponent)
export { CardSpread, TxCardSpreadComponent as TxCardSpread }
export { CARD_SPREAD_VARIANTS } from './src/types'
export type { CardSpreadEmits, CardSpreadProps, CardSpreadSlotProps, CardSpreadVariant, MotionCardItem } from './src/types'
export type TxCardSpreadInstance = InstanceType<typeof TxCardSpreadComponent>
export default CardSpread
