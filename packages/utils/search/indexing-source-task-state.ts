import type { IndexedSourceDiagnostics, IndexedSourceTaskHistoryEntry } from './indexing-source'
import {
  appendIndexedSourceTaskHistory,
  DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT
} from './indexing-source'

export type IndexedSourceRuntimeTaskState = Pick<
  IndexedSourceDiagnostics,
  'lastScan' | 'lastWatch' | 'lastReconcile' | 'lastReset' | 'recentTasks'
>

export type IndexedSourceRuntimeTaskStateKey = Exclude<
  keyof IndexedSourceRuntimeTaskState,
  'recentTasks'
>

export interface IndexedSourceTaskStateUpdateInput<
  TKey extends IndexedSourceRuntimeTaskStateKey
> {
  state: IndexedSourceRuntimeTaskState
  key: TKey
  value: NonNullable<IndexedSourceRuntimeTaskState[TKey]>
  historyEntry: IndexedSourceTaskHistoryEntry
  historyLimit?: number
}

export function updateIndexedSourceTaskState<
  TKey extends IndexedSourceRuntimeTaskStateKey
>(
  input: IndexedSourceTaskStateUpdateInput<TKey>
): IndexedSourceRuntimeTaskState {
  const historyLimit = input.historyLimit ?? DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT
  return {
    ...input.state,
    [input.key]: input.value,
    recentTasks: appendIndexedSourceTaskHistory(
      input.state.recentTasks,
      input.historyEntry,
      historyLimit
    )
  }
}
