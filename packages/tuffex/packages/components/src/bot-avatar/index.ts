import { withInstall } from '../../../utils/withInstall'
import TxBotAvatar from './src/TxBotAvatar.vue'

const BotAvatar = withInstall(TxBotAvatar)

export { BotAvatar, TxBotAvatar }

export { autoInk, luminance, parseColor, shade } from './src/color'
export { OVERSCAN as BOT_AVATAR_OVERSCAN, RISE as BOT_AVATAR_RISE, draw as drawBotAvatarFrame } from './src/draw'
export type { DrawConfig as BotAvatarDrawConfig } from './src/draw'
export { Sim as BotAvatarSim, restPose } from './src/engine'
export { JUMP_DEFAULTS as botAvatarJumpDefaults } from './src/engine'
export type { JumpConfig as BotAvatarJumpConfig } from './src/engine'
export type { Pose as BotAvatarPose } from './src/engine'
export { warmPlastic as warmBotAvatarPlastic } from './src/plastic'
/* the plastic material's building blocks, for renderers on other canvases
   (the React Native port bakes forms with them and lights them in a shader) */
export { buildForm as bakeBotAvatarForm, MATCAP_SIZE as BOT_AVATAR_MATCAP_SIZE, PAD as BOT_AVATAR_PAD, SPAN as BOT_AVATAR_SPAN, capFrame as botAvatarCapFrame, tierFor as botAvatarTier, buildMatcap as buildBotAvatarMatcap, shadeTexels as shadeBotAvatarTexels } from './src/plastic'
export type { Form as BotAvatarForm, Frame as BotAvatarFrame, Material as BotAvatarMaterial, Rig as BotAvatarRig } from './src/plastic'
export {
  botAvatarFaces,
  botAvatarPalette,
  botAvatarPresets,
  botAvatarStates,
  botAvatarTypes,
} from './src/presets'
export { SHAPE_PARTS as botAvatarParts, SHAPE_PATHS as botAvatarShapes } from './src/shapes'

export type {
  BotAvatarAttrs,
  BotAvatarFace,
  BotAvatarPreset,
  BotAvatarProps,
  BotAvatarShading,
  BotAvatarSquashEase,
  BotAvatarState,
  BotAvatarType,
} from './src/types'

export type TxBotAvatarInstance = InstanceType<typeof TxBotAvatar>

export default BotAvatar
