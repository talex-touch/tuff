import type { StatCardProps } from './src/types.ts'
import { withInstall } from '../../../utils/withInstall'
import TxStatCard from './src/TxStatCard.vue'

const StatCard = withInstall(TxStatCard)

export { StatCard, TxStatCard }
export type { StatCardProps }
export type TxStatCardInstance = InstanceType<typeof TxStatCard>

export default StatCard
