import { withInstall } from '../../../utils/withInstall'
import TxGlassSurface from './src/TxGlassSurface.vue'

export interface GlassSurfaceProps {
  width?: string | number
  height?: string | number
  borderRadius?: number
  /**
   * `classic` is the displacement-ramp glass; `lens` refracts through a modelled convex bezel, which is
   * what makes a dragged lens look liquid. Only `lens` reads the lens props below, only `classic`
   * reads the ones above them.
   * @default 'classic'
   */
  engine?: 'classic' | 'lens'
  borderWidth?: number
  brightness?: number
  opacity?: number
  blur?: number
  displace?: number
  backgroundOpacity?: number
  /** @default 1 for `classic`, 1.5 for `lens` */
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
  /** `lens`: how wide the refracting rim is, px. A share of the short side by default (12%, 4 to 10px). */
  bezel?: number
  /** `lens`: how deep the glass is, px; a thicker lens carries content further. A share of the short side by default (20%, 8 to 24px). */
  thickness?: number
  /** `lens`: index of refraction, 1 to 3. @default 1.5 */
  ior?: number
  /** `lens`: scales how far the rim carries content, 0 and up. @default 1 */
  refraction?: number
  /** `lens`: magnification of the middle, 1 and up. @default 1 */
  zoom?: number
  /** `lens`: the bezel's cross-section, a squircle dome or a circular one. @default 'squircle' */
  profile?: 'squircle' | 'circle'
  /** `lens`: strength of the highlight along the edge, 0 and up. @default 1 */
  rimLight?: number
  /** `lens`: saturation of what shows through the edge; above 1 it turns vivid. @default 1 */
  rimSaturation?: number
  /** `lens`: splits colour at the edge, 0 to 0.5. @default 0 */
  dispersion?: number
  /** `lens`: frosting of the backdrop, a blur in px. @default 0 */
  frost?: number
}

const GlassSurface = withInstall(TxGlassSurface)

export { GlassSurface, TxGlassSurface }
export { useLiquidDrag } from './src/use-liquid-drag'
export type { LiquidDragOptions, LiquidDragState } from './src/use-liquid-drag'
export type TxGlassSurfaceInstance = InstanceType<typeof TxGlassSurface>

export default GlassSurface
