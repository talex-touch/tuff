import { withInstall } from '../../../utils/withInstall'
import TxGlassSurface from './src/TxGlassSurface.vue'

export interface GlassSurfaceProps {
  width?: string | number
  height?: string | number
  borderRadius?: number
  borderWidth?: number
  brightness?: number
  opacity?: number
  blur?: number
  displace?: number
  backgroundOpacity?: number
  saturation?: number
  distortionScale?: number
  redOffset?: number
  greenOffset?: number
  blueOffset?: number
  xChannel?: 'R' | 'G' | 'B'
  yChannel?: 'R' | 'G' | 'B'
  mixBlendMode?:
    | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'color-dodge'
    | 'color-burn'
    | 'hard-light'
    | 'soft-light'
    | 'difference'
    | 'exclusion'
    | 'hue'
    | 'saturation'
    | 'color'
    | 'luminosity'
    | 'plus-darker'
    | 'plus-lighter'
}

const GlassSurface = withInstall(TxGlassSurface)

export { GlassSurface, TxGlassSurface }
export type TxGlassSurfaceInstance = InstanceType<typeof TxGlassSurface>

export default GlassSurface
