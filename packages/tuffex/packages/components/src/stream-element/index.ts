import { withInstall } from '../../../utils/withInstall'
import TxStreamElement from './src/TxStreamElement.vue'

/**
 * TxStreamElement — a whole AI answer, streamed: Markdown (or structured parts)
 * rendered word by word on one clock, headings, lists, quotes and code in
 * order, `[n]` markers as citation chips, tables, math and diagrams handed to
 * TxStreamMarkdown, and the stream state for the host's own UI.
 *
 * @example
 * ```ts
 * import { TxStreamElement } from '@talex-touch/tuffex'
 *
 * // <TxStreamElement :content="answer" :streaming="busy" :sources="sources" />
 * ```
 *
 * @public
 */
const StreamElement = withInstall(TxStreamElement)

export { StreamElement, TxStreamElement }
export { parseStreamMarkdown } from './src/parse'
export type { ParseOptions as StreamElementParseOptions } from './src/parse'
export type { StreamElementEmits, StreamElementProps, StreamListItem, StreamPart } from './src/types'
export type TxStreamElementInstance = InstanceType<typeof TxStreamElement>

export default StreamElement
