import TxSegmentedSlider from './src/TxSegmentedSlider.vue'
import { withInstall } from '../../../utils/withInstall'
import type { SegmentedSliderProps, SegmentedSliderEmits, SegmentedSliderSegment } from './src/types'

const SegmentedSlider = withInstall(TxSegmentedSlider)

export { SegmentedSlider, TxSegmentedSlider }
export type { SegmentedSliderProps, SegmentedSliderEmits, SegmentedSliderSegment }
export type TxSegmentedSliderInstance = InstanceType<typeof TxSegmentedSlider>

export default SegmentedSlider
