import type { VoiceClipExpose, VoiceClipProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxVoiceClip from './src/TxVoiceClip.vue'

/**
 * TxVoiceClip — a recorded voice message as a capsule: a play key, a waveform that is also the
 * seek slider, and a countdown. One clip plays at a time across the page; the waveform is decoded
 * from the recording when the host does not pass its own peaks.
 *
 * @example
 * ```ts
 * import { TxVoiceClip } from '@talex-touch/tuffex/voice-clip'
 *
 * // <TxVoiceClip :src="recording.url" :duration-ms="recording.durationMs" />
 * ```
 *
 * @public
 */
const VoiceClip = withInstall(TxVoiceClip)

export { VoiceClip, TxVoiceClip }
export type { VoiceClipExpose, VoiceClipProps }
export type TxVoiceClipInstance = InstanceType<typeof TxVoiceClip>

export default VoiceClip
