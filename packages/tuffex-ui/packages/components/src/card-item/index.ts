import TxCardItem from './src/TxCardItem.vue'
import { withInstall } from '../../../utils/withInstall'
import type { CardItemProps } from './src/types.ts'

const CardItem = withInstall(TxCardItem)

export { CardItem, TxCardItem }
export type { CardItemProps }
export type TxCardItemInstance = InstanceType<typeof TxCardItem>

export default CardItem
