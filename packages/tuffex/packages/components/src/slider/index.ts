import type { SliderEmits, SliderProps } from './src/types.ts'
import { withInstall } from '../../../utils/withInstall'
import TxSlider from './src/TxSlider.vue'

const Slider = withInstall(TxSlider)

export { Slider, TxSlider }
export type { SliderEmits, SliderProps }
export type TxSliderInstance = InstanceType<typeof TxSlider>

export default Slider
