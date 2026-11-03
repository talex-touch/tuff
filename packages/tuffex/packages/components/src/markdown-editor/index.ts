import { withInstall } from '../../../utils/withInstall'
import TxMarkdownEditor from './src/TxMarkdownEditor.vue'

const MarkdownEditor = withInstall(TxMarkdownEditor)

export { MarkdownEditor, TxMarkdownEditor }
// The status bar's counts, for showing the same numbers elsewhere.
export { markdownStats } from './src/markdown-stats'
export type { MarkdownStats } from './src/markdown-stats'
// The change-set algebra a collaboration adapter rebases concurrent edits with.
export {
  applyMarkdownChanges,
  composeMarkdownChanges,
  mapMarkdownPosition,
  transformMarkdownChanges,
} from './src/text-changes'
export {
  MARKDOWN_EDITOR_AI_ACTIONS,
  MARKDOWN_EDITOR_CALLOUT_TYPES,
  MARKDOWN_EDITOR_CODE_THEMES,
  MARKDOWN_EDITOR_DEFAULT_LABELS,
  MARKDOWN_EDITOR_HIGHLIGHT_COLORS,
} from './src/types'
export type { TxCustomEmoji, TxEmojiPack } from '../icon/src/emoji-pack'
export type {
  MarkdownEditorAi,
  MarkdownEditorAiAction,
  MarkdownEditorAiRequest,
  MarkdownEditorCalloutType,
  MarkdownEditorCodeTheme,
  MarkdownEditorCollaboration,
  MarkdownEditorCollaborationHandlers,
  MarkdownEditorComment,
  MarkdownEditorCommentReply,
  MarkdownEditorEmits,
  MarkdownEditorHighlightColor,
  MarkdownEditorLabels,
  MarkdownEditorMode,
  MarkdownEditorPeer,
  MarkdownEditorPresence,
  MarkdownEditorProps,
  MarkdownEditorSelection,
  MarkdownEditorTheme,
  MarkdownEditorToolbarActionKey,
  MarkdownEditorUploadContext,
  MarkdownEditorUploadImage,
  MarkdownEditorUploadResult,
  MarkdownEditorUser,
  MarkdownTextChange,
} from './src/types'
export type TxMarkdownEditorInstance = InstanceType<typeof TxMarkdownEditor>

export default MarkdownEditor
