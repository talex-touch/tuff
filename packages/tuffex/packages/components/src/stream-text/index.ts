import { withInstall } from '../../../utils/withInstall'
import TxStreamCaret from './src/TxStreamCaret.vue'
import TxStreamText from './src/TxStreamText.vue'

/**
 * TxStreamText — text that streams in word by word: a steady cadence however
 * bursty the source, each word fading in out of a blur while its colour sweeps
 * onto the ink, citation chips arriving inline, and the Tuff caret while live.
 * The foundation of `TxStreamElement`.
 *
 * @example
 * ```ts
 * import { TxStreamText } from '@talex-touch/tuffex'
 *
 * // <TxStreamText :content="reply" :streaming="busy" />
 * ```
 *
 * @public
 */
const StreamText = withInstall(TxStreamText)

/** TxStreamCaret — the Tuff logo as a stream caret, for hosts that place it themselves. */
const StreamCaret = withInstall(TxStreamCaret)

export { StreamCaret, StreamText, TxStreamCaret, TxStreamText }
// The pieces the rest of the stream family shares (TxStreamElement, TxCodeStream,
// TxStreamMarkdown), exported for hosts that drive their own stream surfaces.
export { STREAM_PACING_DEFAULTS, STREAM_REVEAL_DURATION_MS, streamRevealDuration } from './src/presets'
export { segmentWords } from './src/segment'
export type { WordUnit } from './src/segment'
export type {
  StreamCaretProps,
  StreamInline,
  StreamMark,
  StreamRevealPreset,
  StreamState,
  StreamTextEmits,
  StreamTextProps,
} from './src/types'
export { useStreamPacer } from './src/use-stream-pacer'
export type { StreamPacer, StreamPacerOptions } from './src/use-stream-pacer'
export type TxStreamTextInstance = InstanceType<typeof TxStreamText>

export default StreamText
