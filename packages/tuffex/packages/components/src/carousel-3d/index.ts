import { withInstall } from '../../../utils/withInstall'
import TxCarousel3DComponent from './src/TxCarousel3D.vue'

const Carousel3D = withInstall(TxCarousel3DComponent)
export { Carousel3D, TxCarousel3DComponent as TxCarousel3D }
export { CAROUSEL_3D_VARIANTS } from './src/types'
export type { Carousel3DEmits, Carousel3DProps, Carousel3DSlotProps, Carousel3DVariant } from './src/types'
export type TxCarousel3DInstance = InstanceType<typeof TxCarousel3DComponent>
export default Carousel3D
