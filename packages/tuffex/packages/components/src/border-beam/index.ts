import { withInstall } from '../../../utils/withInstall'
import TxBorderBeam from './src/TxBorderBeam.vue'

const BorderBeam = withInstall(TxBorderBeam)

export { BorderBeam, TxBorderBeam }
export { sizePresets as borderBeamSizePresets, sizeThemePresets as borderBeamSizeThemePresets } from './src/styles'
// `SizeConfig`/`ThemeColors` are too generic for the star barrel — alias them.
export type {
  BorderBeamColorVariant,
  BorderBeamProps,
  BorderBeamSize,
  BorderBeamTheme,
  SizeConfig as BorderBeamSizeConfig,
  ThemeColors as BorderBeamThemeColors,
} from './src/types'
export type TxBorderBeamInstance = InstanceType<typeof TxBorderBeam>

export default BorderBeam
