// The vendored GitHub sheet is imported here rather than @import-ed inside the SFC's
// <style>: an SFC @import is inlined into that component's own CSS, so two components
// needing it shipped two copies -- 37.2 KiB, 8% of components.css (#1555). As a module
// specifier the bundler sees one file.
import '../markdown-view/src/github-markdown.css'

import type {
  StreamBlock,
  StreamMarkdownBlockContext,
  StreamMarkdownBlockRenderer,
  StreamMarkdownProps,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxCodeBlock from './src/TxCodeBlock.vue'
import TxMermaidBlock from './src/TxMermaidBlock.vue'
import TxStreamMarkdown from './src/TxStreamMarkdown.vue'

const StreamMarkdown = withInstall(TxStreamMarkdown)
const CodeBlock = withInstall(TxCodeBlock)
const MermaidBlock = withInstall(TxMermaidBlock)

export {
  CodeBlock,
  MermaidBlock,
  StreamMarkdown,
  TxCodeBlock,
  TxMermaidBlock,
  TxStreamMarkdown,
}
export { createBlockStream } from './src/use-block-stream'
export type { BlockStream, BlockStreamOptions } from './src/use-block-stream'
export type {
  StreamBlock,
  StreamMarkdownBlockContext,
  StreamMarkdownBlockRenderer,
  StreamMarkdownProps,
}
export type TxStreamMarkdownInstance = InstanceType<typeof TxStreamMarkdown>

export default StreamMarkdown
