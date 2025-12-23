import TxChatList from './src/TxChatList.vue'
import TxChatMessage from './src/TxChatMessage.vue'
import TxChatComposer from './src/TxChatComposer.vue'
import TxTypingIndicator from './src/TxTypingIndicator.vue'
import { withInstall } from '../../../utils/withInstall'
import type {
  ChatComposerEmits,
  ChatComposerProps,
  ChatListProps,
  ChatMessageEmits,
  ChatMessageModel,
  ChatMessageProps,
  TypingIndicatorProps,
} from './src/types'

const ChatList = withInstall(TxChatList)
const ChatMessage = withInstall(TxChatMessage)
const ChatComposer = withInstall(TxChatComposer)
const TypingIndicator = withInstall(TxTypingIndicator)

export {
  ChatList,
  TxChatList,
  ChatMessage,
  TxChatMessage,
  ChatComposer,
  TxChatComposer,
  TypingIndicator,
  TxTypingIndicator,
}
export type {
  ChatListProps,
  ChatMessageProps,
  ChatMessageEmits,
  ChatMessageModel,
  ChatComposerProps,
  ChatComposerEmits,
  TypingIndicatorProps,
}

export default ChatList
