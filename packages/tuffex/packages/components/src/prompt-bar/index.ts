import type {
  PromptBarCommand,
  PromptBarContextUsage,
  PromptBarDictationState,
  PromptBarEmits,
  PromptBarMenuKind,
  PromptBarMenuPlacement,
  PromptBarModel,
  PromptBarProps,
  PromptBarRunStatus,
  PromptBarSendPayload,
  PromptBarSendState,
  PromptBarSource,
  PromptBarSurface,
  PromptBarTrayPlacement,
  PromptBarVariant,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxPromptBar from './src/TxPromptBar.vue'

const PromptBar = withInstall(TxPromptBar)

export { PromptBar, TxPromptBar }

// The `@` / `/` state machine ships on its own so a host can add mentions to
// its own composer — the same split as conversation-stream's `useStickToBottom`.
export { parseToken, useTokenMenu } from './src/use-token-menu'
export type {
  PromptBarToken,
  TokenMenuRow,
  UseTokenMenuOptions,
  UseTokenMenuReturn,
} from './src/use-token-menu'

export type {
  PromptBarCommand,
  PromptBarContextUsage,
  PromptBarDictationState,
  PromptBarEmits,
  PromptBarMenuKind,
  PromptBarMenuPlacement,
  PromptBarModel,
  PromptBarProps,
  PromptBarRunStatus,
  PromptBarSendPayload,
  PromptBarSendState,
  PromptBarSource,
  PromptBarSurface,
  PromptBarTrayPlacement,
  PromptBarVariant,
}

export type TxPromptBarInstance = InstanceType<typeof TxPromptBar>

export default PromptBar
