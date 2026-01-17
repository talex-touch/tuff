import type {
  ChatComposerEmits,
  ChatComposerProps,
  ChatListProps,
  ChatMessageEmits,
  ChatMessageModel,
  ChatMessageProps,
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
  ChatComposerEmits,
  ChatComposerProps,
  ChatListProps,
  ChatMessageEmits,
  ChatMessageModel,
  ChatMessageProps,
  TypingIndicatorProps,
}

export default ChatList
