import { withInstall } from '../../../utils/withInstall'
import TxToolCallCard from './src/TxToolCallCard.vue'

const ToolCallCard = withInstall(TxToolCallCard)

export { ToolCallCard, TxToolCallCard }
// `AiToolCallPart` (the card's data shape) lives in ai-elements and is
// exported there — re-exporting it here would collide in the barrel.
export type TxToolCallCardInstance = InstanceType<typeof TxToolCallCard>

export default ToolCallCard
