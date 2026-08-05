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
