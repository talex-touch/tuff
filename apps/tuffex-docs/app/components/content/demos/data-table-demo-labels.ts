import type { DataTableLabels } from '@talex-touch/tuffex/data-table'

/**
 * The table's filter text in Chinese. TuffEx renders English by default and owns
 * no message catalog, so the zh pages pass these through `labels`.
 */
export const DATA_TABLE_ZH_LABELS: Partial<DataTableLabels> = {
  filter: '筛选{column}',
  filterAll: '全部',
  filterAnyTime: '任意时间',
  filterToday: '今天',
  filterLast3Days: '近 3 天',
  filterLast7Days: '近 7 天',
  filterLast30Days: '近 30 天',
  filterSearch: '搜索',
  filterMin: '最小',
  filterMax: '最大',
  filterReset: '重置',
  filterApply: '完成',
}
