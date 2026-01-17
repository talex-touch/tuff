import type { TreeSelectEmits, TreeSelectNode, TreeSelectProps, TreeSelectValue } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTreeSelect from './src/TxTreeSelect.vue'

const TreeSelect = withInstall(TxTreeSelect)

export { TreeSelect, TxTreeSelect }
export type { TreeSelectEmits, TreeSelectNode, TreeSelectProps, TreeSelectValue }
export type TxTreeSelectInstance = InstanceType<typeof TxTreeSelect>

export default TreeSelect
