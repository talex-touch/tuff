import type {
  AiAttachment,
  AiAttachmentFile,
  AiAttachmentImage,
  AiAttachmentPart,
  AiConversationProps,
  AiElementMessage,
  AiElementMessageRole,
  AiMessagePart,
  AiMessageProps,
  AiReasoningPart,
  AiTextPart,
  AiToolCallPart,
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
  AiAttachment,
  AiAttachmentFile,
  AiAttachmentImage,
  AiAttachmentPart,
  AiConversationProps,
  AiElementMessage,
  AiElementMessageRole,
  AiMessagePart,
  AiMessageProps,
  AiReasoningPart,
  AiTextPart,
  AiToolCallPart,
}

export default AiConversation
