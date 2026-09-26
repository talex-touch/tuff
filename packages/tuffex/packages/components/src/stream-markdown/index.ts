// The vendored GitHub sheet lives in `markdown-view`'s stylesheet, which this component
// borrows through a declared style dependency (see `borrowedStyleDeps` in
// packages/script/build/component-styles.ts). Importing the CSS from here instead made the
// per-entry CSS split emit a second full copy of the sheet into `stream-markdown/style.css`
// -- 37.9 KiB, the largest single line the on-demand budget counts (#1555 fixed the same
// sheet being inlined twice inside one entry; this is the same waste across two).
// Both roots carry `.tx-md`, and every rule in that sheet is scoped under it, so the
// borrowed sheet styles this component's `.markdown-body` exactly as it did when copied.

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
export {
  allowRemoteImageOnce,
  allowRemoteImagesForSession,
  isRemoteImage,
  isRemoteImageAllowed,
  resetRemoteImagePolicy,
} from './src/remote-image-policy'
export { completeInlineMarkup, completeTable } from './src/complete-inline-markup'
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
