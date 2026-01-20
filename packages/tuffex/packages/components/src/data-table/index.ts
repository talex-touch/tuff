import type {
  DataTableAlign,
  DataTableColumn,
  DataTableEmits,
  DataTableKey,
  DataTableProps,
  DataTableRowKey,
  DataTableSortOrder,
  DataTableSortState,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxDataTable from './src/TxDataTable.vue'

const DataTable = withInstall(TxDataTable)

export { DataTable, TxDataTable }
export type {
  DataTableAlign,
  DataTableColumn,
  DataTableEmits,
  DataTableKey,
  DataTableProps,
  DataTableRowKey,
  DataTableSortOrder,
  DataTableSortState,
}
export type TxDataTableInstance = InstanceType<typeof TxDataTable>

export default DataTable
