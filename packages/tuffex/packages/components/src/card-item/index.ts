import type { CardItemProps } from './src/types.ts'
import { withInstall } from '../../../utils/withInstall'
import TxCardItem from './src/TxCardItem.vue'

const CardItem = withInstall(TxCardItem)

export { CardItem, TxCardItem }
export type { CardItemProps }
export type TxCardItemInstance = InstanceType<typeof TxCardItem>

export default CardItem
