import type {
  AiConversationProps,
  AiElementMessage,
  AiElementMessageRole,
  AiMessageProps,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxAiConversation from './src/TxAiConversation.vue'
import TxAiMessage from './src/TxAiMessage.vue'

const AiConversation = withInstall(TxAiConversation)
const AiMessage = withInstall(TxAiMessage)

export {
  AiConversation,
  AiMessage,
  TxAiConversation,
  TxAiMessage,
}
export type {
  AiConversationProps,
  AiElementMessage,
  AiElementMessageRole,
  AiMessageProps,
}

export default AiConversation
