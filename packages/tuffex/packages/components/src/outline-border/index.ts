import type { OutlineBorderProps, OutlineBorderVariant, OutlineClipMode, OutlineClipShape, OutlineShape } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxOutlineBorder from './src/TxOutlineBorder.vue'

export type { OutlineBorderProps, OutlineBorderVariant, OutlineClipMode, OutlineClipShape, OutlineShape }

const OutlineBorder = withInstall(TxOutlineBorder)

export { OutlineBorder, TxOutlineBorder }
export type TxOutlineBorderInstance = InstanceType<typeof TxOutlineBorder>

export default OutlineBorder
