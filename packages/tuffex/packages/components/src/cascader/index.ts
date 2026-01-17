import type { CascaderEmits, CascaderNode, CascaderProps, CascaderValue } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxCascader from './src/TxCascader.vue'

const Cascader = withInstall(TxCascader)

export { Cascader, TxCascader }
export type { CascaderEmits, CascaderNode, CascaderProps, CascaderValue }
export type TxCascaderInstance = InstanceType<typeof TxCascader>

export default Cascader
