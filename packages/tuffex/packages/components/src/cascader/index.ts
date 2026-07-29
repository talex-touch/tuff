import type { CascaderEmits, CascaderKey, CascaderNode, CascaderPath, CascaderProps, CascaderValue } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxCascader from './src/TxCascader.vue'

const Cascader = withInstall(TxCascader)

export { Cascader, TxCascader }
export type { CascaderEmits, CascaderKey, CascaderNode, CascaderPath, CascaderProps, CascaderValue }
export type TxCascaderInstance = InstanceType<typeof TxCascader>

export default Cascader
