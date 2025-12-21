import TxMarkdownView from './src/TxMarkdownView.vue'
import { withInstall } from '../../../utils/withInstall'
import type { MarkdownViewProps } from './src/types'

const MarkdownView = withInstall(TxMarkdownView)

export { MarkdownView, TxMarkdownView }
export type { MarkdownViewProps }
export type TxMarkdownViewInstance = InstanceType<typeof TxMarkdownView>

export default MarkdownView
