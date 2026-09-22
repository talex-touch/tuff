import { withInstall } from '../../../utils/withInstall'
import TxAgentScreen from './src/TxAgentScreen.vue'

/**
 * TxAgentScreen — a framed view of what an agent is looking at.
 *
 * The component owns the frame, the pointer overlay and the caption; the
 * content comes from `src` or the default slot, so the same frame can hold a
 * screenshot, a live canvas or a streamed video.
 *
 * @example
 * ```ts
 * import { TxAgentScreen } from '@talex-touch/tuffex'
 *
 * // <TxAgentScreen :src="frame" alt="Agent's desktop" :cursor="{ x: 52, y: 61 }" />
 * ```
 *
 * @public
 */
withInstall(TxAgentScreen)

export { TxAgentScreen }
export { TxAgentScreen as AgentScreen }
export type {
  AgentScreenCursor,
  AgentScreenProps,
  AgentScreenState,
} from './src/types'
export type TxAgentScreenInstance = InstanceType<typeof TxAgentScreen>

export default TxAgentScreen
