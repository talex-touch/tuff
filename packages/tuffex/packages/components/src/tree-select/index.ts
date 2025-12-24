import TxTreeSelect from './src/TxTreeSelect.vue'
import { withInstall } from '../../../utils/withInstall'
import type { TreeSelectEmits, TreeSelectNode, TreeSelectProps, TreeSelectValue } from './src/types'

const TreeSelect = withInstall(TxTreeSelect)

export { TreeSelect, TxTreeSelect }
export type { TreeSelectProps, TreeSelectEmits, TreeSelectNode, TreeSelectValue }
export type TxTreeSelectInstance = InstanceType<typeof TxTreeSelect>

export default TreeSelect
