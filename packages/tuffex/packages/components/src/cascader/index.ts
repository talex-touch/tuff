import TxCascader from './src/TxCascader.vue'
import { withInstall } from '../../../utils/withInstall'
import type { CascaderEmits, CascaderNode, CascaderProps, CascaderValue } from './src/types'

const Cascader = withInstall(TxCascader)

export { Cascader, TxCascader }
export type { CascaderProps, CascaderEmits, CascaderNode, CascaderValue }
export type TxCascaderInstance = InstanceType<typeof TxCascader>

export default Cascader
