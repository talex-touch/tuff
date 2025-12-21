import TxSlider from './src/TxSlider.vue'
import { withInstall } from '../../../utils/withInstall'
import type { SliderProps, SliderEmits } from './src/types.ts'

const Slider = withInstall(TxSlider)

export { Slider, TxSlider }
export type { SliderProps, SliderEmits }
export type TxSliderInstance = InstanceType<typeof TxSlider>

export default Slider
