// The vendored GitHub sheet is imported here rather than @import-ed inside the SFC's
// <style>: an SFC @import is inlined into that component's own CSS, so two components
// needing it shipped two copies -- 37.2 KiB, 8% of components.css (#1555). As a module
// specifier the bundler sees one file.
import './src/github-markdown.css'

import type { MarkdownViewProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxMarkdownView from './src/TxMarkdownView.vue'

const MarkdownView = withInstall(TxMarkdownView)

export { MarkdownView, TxMarkdownView }
export type { MarkdownViewProps }
export type TxMarkdownViewInstance = InstanceType<typeof TxMarkdownView>

export default MarkdownView
