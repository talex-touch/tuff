import type { MarkdownViewProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxMarkdownView from './src/TxMarkdownView.vue'

const MarkdownView = withInstall(TxMarkdownView)

export { MarkdownView, TxMarkdownView }
export type { MarkdownViewProps }
export type TxMarkdownViewInstance = InstanceType<typeof TxMarkdownView>

export default MarkdownView
