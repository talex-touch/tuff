<script setup lang="ts">
import type { DataTableColumn, DataTableSortCycle, DataTableSortState } from '@talex-touch/tuffex/data-table'
import { computed, ref } from 'vue'

interface Track {
  id: number
  title: string
  artist: string
  /** Seconds; the column formats it, sorting reads the number. */
  duration: number
  plays: number
  releasedAt: string
}

const DEFAULT_SORT: DataTableSortState = { key: 'plays', order: 'desc' }

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

const cycle = ref<DataTableSortCycle>('tri')
const sort = ref<DataTableSortState | null>(DEFAULT_SORT)

const copy = computed(() => (isZh.value
  ? {
      cycleLabel: '排序循环',
      cycles: { tri: '三态', bi: '两态' } as Record<DataTableSortCycle, string>,
      cycleHints: {
        tri: '升序 → 降序 → 取消排序',
        bi: '升序与降序交替，不会取消',
      } as Record<DataTableSortCycle, string>,
      sortedBy: '排序：',
      unsorted: '未排序',
      orders: { asc: '升序', desc: '降序' },
      columns: { title: '歌曲', artist: '歌手', duration: '时长', plays: '播放量', releasedAt: '发行日期' },
      tracks: [
        ['海边的信', '林夏'],
        ['晚风车站', '周屿'],
        ['第七个夏天', '白鹭乐队'],
        ['玻璃城', '沈南'],
        ['雾中灯塔', '苏念'],
        ['北纬三十度', '陆川'],
      ],
    }
  : {
      cycleLabel: 'Sort cycle',
      cycles: { tri: 'Tri-state', bi: 'Two-state' } as Record<DataTableSortCycle, string>,
      cycleHints: {
        tri: 'Ascending → descending → unsorted',
        bi: 'Alternates between ascending and descending, never unsorts',
      } as Record<DataTableSortCycle, string>,
      sortedBy: 'Sorted by ',
      unsorted: 'Unsorted',
      orders: { asc: 'ascending', desc: 'descending' },
      columns: { title: 'Track', artist: 'Artist', duration: 'Length', plays: 'Plays', releasedAt: 'Released' },
      tracks: [
        ['Letters by the Sea', 'Lena Hart'],
        ['Evening Wind Station', 'Owen Vale'],
        ['Seventh Summer', 'The Herons'],
        ['Glass City', 'Mira Sol'],
        ['Lighthouse in the Fog', 'Jonah Reyes'],
        ['Thirty Degrees North', 'Ada Quinn'],
      ],
    }))

const STATS: Array<Omit<Track, 'title' | 'artist'>> = [
  { id: 1, duration: 214, plays: 1_284_000, releasedAt: '2026-03-18' },
  { id: 2, duration: 187, plays: 942_500, releasedAt: '2025-11-02' },
  { id: 3, duration: 263, plays: 2_031_700, releasedAt: '2024-07-21' },
  { id: 4, duration: 158, plays: 486_300, releasedAt: '2026-08-09' },
  { id: 5, duration: 241, plays: 1_517_900, releasedAt: '2025-05-30' },
  { id: 6, duration: 199, plays: 73_800, releasedAt: '2026-09-27' },
]

const rows = computed<Track[]>(() => STATS.map((stat, index) => {
  const [title, artist] = copy.value.tracks[index]!
  return { ...stat, title: title!, artist: artist! }
}))

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// Number and date columns sort by value on their own; the title opts in.
const columns = computed<DataTableColumn<Track>[]>(() => [
  { key: 'title', title: copy.value.columns.title, sortable: true },
  { key: 'artist', title: copy.value.columns.artist },
  { key: 'duration', title: copy.value.columns.duration, type: 'number', format: value => formatDuration(Number(value)) },
  { key: 'plays', title: copy.value.columns.plays, type: 'number', format: value => Number(value).toLocaleString(isZh.value ? 'zh-CN' : 'en-US') },
  { key: 'releasedAt', title: copy.value.columns.releasedAt, type: 'date' },
])

const readout = computed(() => {
  const current = sort.value
  if (!current?.order)
    return copy.value.unsorted
  const title = copy.value.columns[current.key as keyof typeof copy.value.columns]
  return `${copy.value.sortedBy}${title} · ${copy.value.orders[current.order]}`
})

function setCycle(value: unknown) {
  cycle.value = value as DataTableSortCycle
}
</script>

<template>
  <div class="data-table-sorting-demo not-prose">
    <div class="data-table-sorting-demo__bar">
      <TxFlatRadio :model-value="cycle" size="sm" :aria-label="copy.cycleLabel" @update:model-value="setCycle">
        <TxFlatRadioItem value="tri" :label="copy.cycles.tri" />
        <TxFlatRadioItem value="bi" :label="copy.cycles.bi" />
      </TxFlatRadio>
      <span class="data-table-sorting-demo__readout" aria-live="polite">{{ readout }}</span>
    </div>

    <TxDataTable
      :columns="columns"
      :data="rows"
      row-key="id"
      :default-sort="DEFAULT_SORT"
      :sort-cycle="cycle"
      @update:sort="sort = $event"
    />

    <p class="data-table-sorting-demo__hint">
      {{ copy.cycleHints[cycle] }}
    </p>
  </div>
</template>

<style scoped>
.data-table-sorting-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.data-table-sorting-demo__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.data-table-sorting-demo__readout {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.data-table-sorting-demo__hint {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
}
</style>
