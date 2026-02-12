import type { KeyframeStrokeTextProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxKeyframeStrokeText from './src/TxKeyframeStrokeText.vue'

const KeyframeStrokeText = withInstall(TxKeyframeStrokeText)

export { KeyframeStrokeText, TxKeyframeStrokeText }
export type { KeyframeStrokeTextProps }
export type TxKeyframeStrokeTextInstance = InstanceType<typeof TxKeyframeStrokeText>

export default KeyframeStrokeText
