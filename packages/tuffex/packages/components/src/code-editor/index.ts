import { withInstall } from '../../../utils/withInstall'
import TxCodeEditor from './src/TxCodeEditor.vue'
import TxCodeEditorToolbar from './src/TxCodeEditorToolbar.vue'

const CodeEditor = withInstall(TxCodeEditor)
const CodeEditorToolbar = withInstall(TxCodeEditorToolbar)

export { CodeEditor, CodeEditorToolbar, TxCodeEditor, TxCodeEditorToolbar }
export type {
  CodeEditorEmits,
  CodeEditorProps,
  CodeEditorToolbarEmits,
  CodeEditorToolbarProps,
  CodeEditorLanguage,
  CodeEditorTheme,
  CodeEditorToolbarAction,
  CodeEditorToolbarActionKey,
} from './src/types'
export type TxCodeEditorInstance = InstanceType<typeof TxCodeEditor>
export type TxCodeEditorToolbarInstance = InstanceType<typeof TxCodeEditorToolbar>

export default CodeEditor
