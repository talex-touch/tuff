import { withInstall } from '../../../utils/withInstall'
import TxOutlineBorder from './src/TxOutlineBorder.vue'
import type { OutlineBorderProps, OutlineBorderVariant, OutlineClipMode, OutlineClipShape, OutlineShape } from './src/types'

export type { OutlineBorderProps, OutlineBorderVariant, OutlineClipMode, OutlineClipShape, OutlineShape }

const OutlineBorder = withInstall(TxOutlineBorder)

export { OutlineBorder, TxOutlineBorder }
export type TxOutlineBorderInstance = InstanceType<typeof TxOutlineBorder>

export default OutlineBorder
