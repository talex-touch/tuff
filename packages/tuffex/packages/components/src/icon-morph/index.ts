import type { IconMorphProps, MorphHandle, MorphIconProps, MorphIconSource } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxIconMorph from './src/TxIconMorph.vue'

const IconMorph = withInstall(TxIconMorph)
const MorphIcon = IconMorph
const TxMorphIcon = TxIconMorph
export { BUILTIN_MORPH_ICONS } from './src/types'
export { IconMorph, MorphIcon, TxIconMorph, TxMorphIcon }
export type { IconMorphProps, MorphHandle, MorphIconProps, MorphIconSource }
export type TxIconMorphInstance = InstanceType<typeof TxIconMorph>
export type TxMorphIconInstance = TxIconMorphInstance

// The engine is exported for direct canvas/mask/DOM driving or custom morphing pipelines
export * from './src/engine'

export default IconMorph
