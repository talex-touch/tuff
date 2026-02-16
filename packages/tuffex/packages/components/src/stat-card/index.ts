import type { StatCardInsight, StatCardInsightType, StatCardProps, StatCardVariant } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxStatCard from './src/TxStatCard.vue'

const StatCard = withInstall(TxStatCard)

export { StatCard, TxStatCard }
export type { StatCardInsight, StatCardInsightType, StatCardProps, StatCardVariant }
export type TxStatCardInstance = InstanceType<typeof TxStatCard>

export default StatCard
