import type {
  TaskRowDetail,
  TaskRowItem,
  TaskRowsProps,
  TaskRowStatus,
  TaskRowsVariant,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxTaskRows.vue'

const TxTaskRows = withInstall(component)

export { TxTaskRows }
export type {
  TaskRowDetail,
  TaskRowItem,
  TaskRowsProps,
  TaskRowStatus,
  TaskRowsVariant,
}
export type TxTaskRowsInstance = InstanceType<typeof component>

export default TxTaskRows
