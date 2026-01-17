import type { AgentItemProps, AgentsListProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxAgentItem from './src/TxAgentItem.vue'
import TxAgentsList from './src/TxAgentsList.vue'

const AgentItem = withInstall(TxAgentItem)
const AgentsList = withInstall(TxAgentsList)

export { AgentItem, AgentsList, TxAgentItem, TxAgentsList }
export type { AgentItemProps, AgentsListProps }

export default AgentsList
