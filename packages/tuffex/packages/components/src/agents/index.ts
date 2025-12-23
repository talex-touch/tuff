import TxAgentItem from './src/TxAgentItem.vue'
import TxAgentsList from './src/TxAgentsList.vue'
import { withInstall } from '../../../utils/withInstall'
import type { AgentItemProps, AgentsListProps } from './src/types'

const AgentItem = withInstall(TxAgentItem)
const AgentsList = withInstall(TxAgentsList)

export { AgentItem, TxAgentItem, AgentsList, TxAgentsList }
export type { AgentItemProps, AgentsListProps }

export default AgentsList
