import type {
  DiffChangeKind,
  DiffTableAlign,
  DiffTableColumn,
  DiffTableEmits,
  DiffTablePlay,
  DiffTableProps,
  DiffTableRow,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxDiffTable from './src/TxDiffTable.vue'

const DiffTable = withInstall(TxDiffTable)

export { DiffTable, TxDiffTable }
export type {
  DiffChangeKind,
  DiffTableAlign,
  DiffTableColumn,
  DiffTableEmits,
  DiffTablePlay,
  DiffTableProps,
  DiffTableRow,
}

/**
 * Imperative surface of {@link TxDiffTable}.
 *
 * Written out rather than derived from `InstanceType`: the component is
 * generic, and `vue-tsc` reports an exposed ref by its unwrapped type, so
 * `stage` is a `number` here and not a `Ref<number>`.
 *
 * @public
 */
export interface TxDiffTableInstance {
  /** Runs the sequence from wherever it currently rests. */
  play: () => void
  /** Returns to the plain table and stops any pending stage. */
  reset: () => void
  /** Jumps straight to the completed diff. */
  settle: () => void
  /** Current stage index; `stageDelays.length` once settled. */
  stage: number
}

export default DiffTable
