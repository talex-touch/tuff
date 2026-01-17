import type { TxCardBackground, TxCardProps, TxCardShadow, TxCardSize, TxCardVariant } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxCard from './src/TxCard.vue'

const Card = withInstall(TxCard)

export { Card, TxCard }
export type { TxCardBackground, TxCardProps, TxCardShadow, TxCardSize, TxCardVariant }
export type TxCardInstance = InstanceType<typeof TxCard>

export default Card
