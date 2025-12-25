import TxCard from './src/TxCard.vue'
import { withInstall } from '../../../utils/withInstall'
import type { TxCardBackground, TxCardProps, TxCardShadow, TxCardSize, TxCardVariant } from './src/types'

const Card = withInstall(TxCard)

export { Card, TxCard }
export type { TxCardProps, TxCardVariant, TxCardBackground, TxCardShadow, TxCardSize }
export type TxCardInstance = InstanceType<typeof TxCard>

export default Card
