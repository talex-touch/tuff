import { withInstall } from '../../../utils/withInstall'
import TxCollapse from './src/TxCollapse.vue'
import TxCollapseItem from './src/TxCollapseItem.vue'

// TxCollapse/TxCollapseItem type their props with local (unexported) interfaces,
// so a freshly inferred `const Collapse = withInstall(...)` cannot be named in the
// emitted .d.ts (TS4023 -> the barrel's index.d.ts silently stops emitting).
// Mutate-install in place and re-export the bindings instead.
withInstall(TxCollapse)
withInstall(TxCollapseItem)

export { TxCollapse, TxCollapseItem }
export { TxCollapse as Collapse, TxCollapseItem as CollapseItem }
export type { CollapseContext, CollapseEmits, CollapseItemProps, CollapseProps } from './src/types'
export type TxCollapseInstance = InstanceType<typeof TxCollapse>
export type TxCollapseItemInstance = InstanceType<typeof TxCollapseItem>

export default TxCollapse
