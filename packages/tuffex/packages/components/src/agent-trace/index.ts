import type {
  AgentTraceProps,
  AgentTraceRow,
  AgentTraceRowStatus,
  AgentTraceVariant,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxAgentTrace.vue'

const TxAgentTrace = withInstall(component)

export { TxAgentTrace }
export type {
  AgentTraceProps,
  AgentTraceRow,
  AgentTraceRowStatus,
  AgentTraceVariant,
}
export type TxAgentTraceInstance = InstanceType<typeof component>

export default TxAgentTrace
