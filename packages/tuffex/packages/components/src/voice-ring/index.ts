import type { Plugin } from 'vue'
import { withInstall } from '../../../utils/withInstall'
import TxVoiceRingSfc from './src/TxVoiceRing.vue'

const TxVoiceRing: typeof TxVoiceRingSfc & Plugin = withInstall(TxVoiceRingSfc)
const TuffVoiceRing: typeof TxVoiceRingSfc & Plugin = TxVoiceRing
const VoiceRing: typeof TxVoiceRingSfc & Plugin = TxVoiceRing

export { TuffVoiceRing, TxVoiceRing, VoiceRing }

export { useVoiceRingMicrophone } from './src/use-microphone'
export type {
  UseVoiceRingMicrophoneOptions,
  UseVoiceRingMicrophoneResult,
  VoiceRingMicrophoneState,
} from './src/use-microphone'

export {
  acquireAnalyser as acquireVoiceRingAnalyser,
  getAudioContext as getVoiceRingAudioContext,
  isAudioSupported as isVoiceRingAudioSupported,
} from './src/audio'
export type { AnalyserLease as VoiceRingAnalyserLease } from './src/audio'

export { SPECTRUM_N as VOICE_RING_SPECTRUM_N, VoiceFollower } from './src/voice'
export {
  ACCENT_COLORS as VOICE_RING_ACCENT_COLORS,
  EMOTION_COLORS as VOICE_RING_EMOTION_COLORS,
} from './src/emotion'
export type {
  VoiceOrbAccent as VoiceRingAccent,
  VoiceOrbEmotion as VoiceRingEmotion,
} from './src/emotion'
export {
  PRESETS as VOICE_RING_PRESETS,
  resolvePreset as resolveVoiceRingPreset,
} from './src/presets'
export type {
  TypeFrame as VoiceRingFrameFn,
  TypeOpts as VoiceRingTypeOpts,
  VoiceInput as VoiceRingInput,
} from './src/engine/types'

export { VOICE_RING_DEFAULT_LABELS } from './src/types'
export type {
  VoiceRingBoundsTarget,
  VoiceRingLabels,
  VoiceRingProps,
  VoiceRingState,
  VoiceRingTheme,
  VoiceRingType,
} from './src/types'
export type TxVoiceRingInstance = InstanceType<typeof TxVoiceRing>

export default TxVoiceRing
