import TxStatCard from './src/TxStatCard.vue'
import { withInstall } from '../../../utils/withInstall'
import type { StatCardProps } from './src/types.ts'

const StatCard = withInstall(TxStatCard)

export { StatCard, TxStatCard }
export type { StatCardProps }
export type TxStatCardInstance = InstanceType<typeof TxStatCard>

export default StatCard
