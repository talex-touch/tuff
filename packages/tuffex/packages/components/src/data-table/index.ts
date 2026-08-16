import type {
  DataTableAlign,
  DataTableColumnFixed,
  DataTableColumn,
  DataTableEmits,
  DataTableHeaderSlotProps,
  DataTableKey,
  DataTableLayout,
  DataTableProps,
  DataTableRowClass,
  DataTableRowKey,
  DataTableSortCycle,
  DataTableSortOrder,
  DataTableSortState,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxDataTable from './src/TxDataTable.vue'

const DataTable = withInstall(TxDataTable)

export { DataTable, TxDataTable }
export type {
  DataTableAlign,
  DataTableColumnFixed,
  DataTableColumn,
  DataTableEmits,
  DataTableHeaderSlotProps,
  DataTableKey,
  DataTableLayout,
  DataTableProps,
  DataTableRowClass,
  DataTableRowKey,
  DataTableSortCycle,
  DataTableSortOrder,
  DataTableSortState,
}
export type TxDataTableInstance = InstanceType<typeof TxDataTable>

export default DataTable
