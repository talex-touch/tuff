import { withInstall } from '../../../utils/withInstall'
import TxMarkdownEditor from './src/TxMarkdownEditor.vue'

const MarkdownEditor = withInstall(TxMarkdownEditor)

export { MarkdownEditor, TxMarkdownEditor }
export type {
  MarkdownEditorEmits,
  MarkdownEditorMode,
  MarkdownEditorProps,
  MarkdownEditorTheme,
  MarkdownEditorToolbarActionKey,
} from './src/types'
export type TxMarkdownEditorInstance = InstanceType<typeof TxMarkdownEditor>

export default MarkdownEditor
