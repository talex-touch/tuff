<script setup lang="ts">
import type { DataTableColumn, DataTableFilterState } from '@talex-touch/tuffex/data-table'
import { computed, ref } from 'vue'
import { DATA_TABLE_ZH_LABELS } from './data-table-demo-labels'

interface Track {
  id: number
  title: string
  artist: string
  /** Seconds. */
  duration: number
  plays: number
  /** An ISO instant, recent enough for the date presets to have rows to keep. */
  updatedAt: string
}

type DurationBucket = 'all' | 'short' | 'mid' | 'long'

const HOUR = 3_600_000

// Each bucket writes the `{ min, max }` shape a number column already filters
// by, so the custom panel needs no matching code of its own.
const DURATION_RANGES: Record<Exclude<DurationBucket, 'all'>, { min?: number, max?: number }> = {
  short: { max: 180 },
  mid: { min: 180, max: 240 },
  long: { min: 240 },
}

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')
const labels = computed(() => (isZh.value ? DATA_TABLE_ZH_LABELS : undefined))

const filter = ref<DataTableFilterState>({})
const hasFilter = computed(() => Object.keys(filter.value).length > 0)

const copy = computed(() => (isZh.value
  ? {
      columns: { title: '歌曲', artist: '歌手', duration: '时长', plays: '播放量', updatedAt: '更新于' },
      durationLabel: '按时长筛选',
      buckets: { all: '全部', short: '3 分钟内', mid: '3–4 分钟', long: '4 分钟以上' } as Record<DurationBucket, string>,
      state: '筛选状态',
      clear: '清除全部',
      tracks: [
        ['海边的信', '林夏'],
        ['晚风车站', '周屿'],
        ['第七个夏天', '白鹭乐队'],
        ['玻璃城', '沈南'],
        ['雾中灯塔', '苏念'],
        ['北纬三十度', '陆川'],
        ['纸风筝的午后', '林夏'],
        ['慢车', '许眠'],
        ['橘子汽水', '何遥'],
        ['夜渡', '江橙'],
        ['九号站台', '周屿'],
        ['失眠的鲸', '唐棠'],
      ],
    }
  : {
      columns: { title: 'Track', artist: 'Artist', duration: 'Length', plays: 'Plays', updatedAt: 'Updated' },
      durationLabel: 'Filter by length',
      buckets: { all: 'All', short: 'Under 3 min', mid: '3–4 min', long: 'Over 4 min' } as Record<DurationBucket, string>,
      state: 'Filter state',
      clear: 'Clear all',
      tracks: [
        ['Letters by the Sea', 'Lena Hart'],
        ['Evening Wind Station', 'Owen Vale'],
        ['Seventh Summer', 'The Herons'],
        ['Glass City', 'Mira Sol'],
        ['Lighthouse in the Fog', 'Jonah Reyes'],
        ['Thirty Degrees North', 'Ada Quinn'],
        ['Paper Kites at Noon', 'Lena Hart'],
        ['The Slow Local', 'Theo Marsh'],
        ['Orange Soda', 'Ivy Lane'],
        ['Night Ferry', 'Nora Bell'],
        ['Platform Nine', 'Owen Vale'],
        ['The Sleepless Whale', 'Kai Moreno'],
      ],
    }))

const now = Date.now()

// A `datetime` column reads date strings; an epoch number does not parse.
function ago(ms: number) {
  return new Date(now - ms).toISOString()
}

const STATS: Array<Omit<Track, 'title' | 'artist'>> = [
  { id: 1, duration: 214, plays: 1_284_000, updatedAt: ago(1 * HOUR) },
  { id: 2, duration: 187, plays: 942_500, updatedAt: ago(5 * HOUR) },
  { id: 3, duration: 263, plays: 2_031_700, updatedAt: ago(20 * HOUR) },
  { id: 4, duration: 158, plays: 486_300, updatedAt: ago(36 * HOUR) },
  { id: 5, duration: 241, plays: 1_517_900, updatedAt: ago(60 * HOUR) },
  { id: 6, duration: 199, plays: 73_800, updatedAt: ago(4 * 24 * HOUR) },
  { id: 7, duration: 172, plays: 655_200, updatedAt: ago(6 * 24 * HOUR) },
  { id: 8, duration: 296, plays: 128_400, updatedAt: ago(9 * 24 * HOUR) },
  { id: 9, duration: 166, plays: 3_406_000, updatedAt: ago(15 * 24 * HOUR) },
  { id: 10, duration: 228, plays: 391_700, updatedAt: ago(22 * 24 * HOUR) },
  { id: 11, duration: 205, plays: 812_900, updatedAt: ago(40 * 24 * HOUR) },
  { id: 12, duration: 318, plays: 54_100, updatedAt: ago(75 * 24 * HOUR) },
]

const rows = computed<Track[]>(() => STATS.map((stat, index) => {
  const [title, artist] = copy.value.tracks[index]!
  return { ...stat, title: title!, artist: artist! }
}))

const timeFormat = computed(() => new Intl.DateTimeFormat(isZh.value ? 'zh-CN' : 'en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}))

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const columns = computed<DataTableColumn<Track>[]>(() => [
  { key: 'title', title: copy.value.columns.title, filter: true },
  { key: 'artist', title: copy.value.columns.artist, type: 'tag', filter: true },
  { key: 'duration', title: copy.value.columns.duration, type: 'number', filter: true, format: value => formatDuration(Number(value)) },
  { key: 'plays', title: copy.value.columns.plays, type: 'number', filter: true, format: value => Number(value).toLocaleString(isZh.value ? 'zh-CN' : 'en-US') },
  { key: 'updatedAt', title: copy.value.columns.updatedAt, type: 'datetime', filter: true, format: value => timeFormat.value.format(new Date(String(value))) },
])

function bucketOf(value: unknown): DurationBucket {
  if (!value || typeof value !== 'object')
    return 'all'
  const { min, max } = value as { min?: number, max?: number }
  const match = Object.entries(DURATION_RANGES).find(([, range]) => range.min === min && range.max === max)
  return (match?.[0] as DurationBucket | undefined) ?? 'all'
}

function pickDuration(value: unknown, setFilter: (value: unknown) => void, close: () => void) {
  const bucket = value as DurationBucket
  setFilter(bucket === 'all' ? undefined : { ...DURATION_RANGES[bucket] })
  close()
}
</script>

<template>
  <div class="data-table-filters-demo not-prose">
    <TxDataTable v-model:filter="filter" :columns="columns" :data="rows" :labels="labels" row-key="id">
      <template #filter-duration="{ filterValue, setFilter, close }">
        <TxFlatRadio
          :model-value="bucketOf(filterValue)"
          size="sm"
          :aria-label="copy.durationLabel"
          @update:model-value="value => pickDuration(value, setFilter, close)"
        >
          <TxFlatRadioItem value="all" :label="copy.buckets.all" />
          <TxFlatRadioItem value="short" :label="copy.buckets.short" />
          <TxFlatRadioItem value="mid" :label="copy.buckets.mid" />
          <TxFlatRadioItem value="long" :label="copy.buckets.long" />
        </TxFlatRadio>
      </template>
    </TxDataTable>

    <div class="data-table-filters-demo__state">
      <span>{{ copy.state }}</span>
      <code>{{ JSON.stringify(filter) }}</code>
      <TxButton variant="ghost" size="sm" :disabled="!hasFilter" @click="filter = {}">
        {{ copy.clear }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.data-table-filters-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.data-table-filters-demo__state {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.data-table-filters-demo__state code {
  flex: 1 1 200px;
  min-width: 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  overflow-wrap: anywhere;
}
</style>
