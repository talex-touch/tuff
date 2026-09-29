import { withInstall } from '../../../utils/withInstall'
import TxVoiceBeam from './src/TxVoiceBeam.vue'

const VoiceBeam = withInstall(TxVoiceBeam)

export { VoiceBeam, TxVoiceBeam }
export { useMicrophone } from './src/use-microphone'
export type { MicrophoneState, UseMicrophoneOptions, UseMicrophoneResult } from './src/use-microphone'

export { getAudioContext, isAudioSupported } from './src/audio'
export { parseRgb } from './src/color'

export { voiceDefaults, voiceTypePresets, voiceTypeStyle, resolveVoiceDefaults, resolveVoiceStyle } from './src/presets'
// `themePresets` is too generic for the star barrel — alias it, as
// border-beam does with its own `sizeThemePresets`.
export {
  themePresets as voiceBeamThemePresets,
  voicePalettes,
  voiceLobes,
  LOBE_SPACING,
  LOBE_SPAN,
} from './src/styles'

export type {
  VoiceBeamColorVariant,
  VoiceBeamLevel,
  VoiceBeamProps,
  VoiceBeamTheme,
  VoiceBeamType,
  VoiceThemeColors,
} from './src/types'
// `VoiceGeometry` is too generic for the star barrel — alias it.
export type { VoiceGeometry as VoiceBeamGeometry, VoiceTypeStyle } from './src/presets'
export type { VoiceLobe } from './src/styles'
export type TxVoiceBeamInstance = InstanceType<typeof TxVoiceBeam>

export default VoiceBeam
