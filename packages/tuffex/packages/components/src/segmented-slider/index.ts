import type { SegmentedSliderEmits, SegmentedSliderProps, SegmentedSliderSegment } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxSegmentedSlider from './src/TxSegmentedSlider.vue'

const SegmentedSlider = withInstall(TxSegmentedSlider)

export { SegmentedSlider, TxSegmentedSlider }
export type { SegmentedSliderEmits, SegmentedSliderProps, SegmentedSliderSegment }
export type TxSegmentedSliderInstance = InstanceType<typeof TxSegmentedSlider>

export default SegmentedSlider
