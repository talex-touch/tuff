import type {
  ChatComposerAttachment,
  ChatComposerEmits,
  ChatComposerMicState,
  ChatComposerProps,
  ChatComposerSendState,
  ChatComposerSurface,
  ChatComposerTrayPlacement,
  ChatListMode,
  ChatListProps,
  ChatMessageActionsMode,
  ChatMessageAttachment,
  ChatMessageAttachmentImage,
  ChatMessageEmits,
  ChatMessageModel,
  ChatMessageProps,
  ChatMessageRole,
  ChatMessageSpeakState,
  ChatMessageStatus,
  ChatMessageVariant,
  ChatMessageVoice,
  TypingIndicatorProps,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxChatComposer from './src/TxChatComposer.vue'
import TxChatList from './src/TxChatList.vue'
import TxChatMessage from './src/TxChatMessage.vue'
import TxTypingIndicator from './src/TxTypingIndicator.vue'

const ChatList = withInstall(TxChatList)
const ChatMessage = withInstall(TxChatMessage)
const ChatComposer = withInstall(TxChatComposer)
const TypingIndicator = withInstall(TxTypingIndicator)

export {
  ChatComposer,
  ChatList,
  ChatMessage,
  TxChatComposer,
  TxChatList,
  TxChatMessage,
  TxTypingIndicator,
  TypingIndicator,
}
export type {
  ChatComposerAttachment,
  ChatComposerEmits,
  ChatComposerMicState,
  ChatComposerProps,
  ChatComposerSendState,
  ChatComposerSurface,
  ChatComposerTrayPlacement,
  ChatListMode,
  ChatListProps,
  ChatMessageActionsMode,
  ChatMessageAttachment,
  ChatMessageAttachmentImage,
  ChatMessageEmits,
  ChatMessageModel,
  ChatMessageProps,
  ChatMessageRole,
  ChatMessageSpeakState,
  ChatMessageStatus,
  ChatMessageVariant,
  ChatMessageVoice,
  TypingIndicatorProps,
}

export default ChatList
