import { withInstall } from '../../../utils/withInstall'
import TxMessageActions from './src/TxMessageActions.vue'

const MessageActions = withInstall(TxMessageActions)

export { MessageActions, TxMessageActions }
export type TxMessageActionsInstance = InstanceType<typeof TxMessageActions>

export default MessageActions
