import type { TreeEmits, TreeKey, TreeNode, TreeProps, TreeValue } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTree from './src/TxTree.vue'

const Tree = withInstall(TxTree)

export { Tree, TxTree }
export type { TreeEmits, TreeKey, TreeNode, TreeProps, TreeValue }
export type TxTreeInstance = InstanceType<typeof TxTree>

export default Tree
