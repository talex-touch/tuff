import { withInstall } from '../../../utils/withInstall'
import TxChainOfThought from './src/TxChainOfThought.vue'

const ChainOfThought = withInstall(TxChainOfThought)

export { ChainOfThought, TxChainOfThought }
// `AiChainStep` lives in ai-elements — the single parts home.
export type TxChainOfThoughtInstance = InstanceType<typeof TxChainOfThought>

export default ChainOfThought
