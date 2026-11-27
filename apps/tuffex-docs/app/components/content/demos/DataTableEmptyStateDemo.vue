<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { computed, ref } from 'vue'

interface Track {
  id: number
  title: string
  artist: string
  plays: number
}

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

const copy = computed(() => (isZh.value
  ? {
      search: '搜索歌曲或歌手',
      emptyTitle: (query: string) => `没有匹配「${query}」的歌曲`,
      emptyDescription: '换个关键词，或清除搜索查看全部歌曲。',
      clear: '清除搜索',
      columns: { title: '歌曲', artist: '歌手', plays: '播放量' },
      tracks: [
        ['海边的信', '林夏'],
        ['晚风车站', '周屿'],
        ['第七个夏天', '白鹭乐队'],
        ['玻璃城', '沈南'],
      ],
    }
  : {
      search: 'Search tracks or artists',
      emptyTitle: (query: string) => `No tracks match “${query}”`,
      emptyDescription: 'Try another keyword, or clear the search to see every track.',
      clear: 'Clear search',
      columns: { title: 'Track', artist: 'Artist', plays: 'Plays' },
      tracks: [
        ['Letters by the Sea', 'Lena Hart'],
        ['Evening Wind Station', 'Owen Vale'],
        ['Seventh Summer', 'The Herons'],
        ['Glass City', 'Mira Sol'],
      ],
    }))

// Opens on a search that matches nothing, so the empty state is what shows first.
const query = ref(isZh.value ? '爵士' : 'jazz')

const PLAYS = [1_284_000, 942_500, 2_031_700, 486_300]

const rows = computed<Track[]>(() => copy.value.tracks.map(([title, artist], index) => ({
  id: index + 1,
  title: title!,
  artist: artist!,
  plays: PLAYS[index]!,
})))

const visibleRows = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle)
    return rows.value
  return rows.value.filter(row => `${row.title} ${row.artist}`.toLowerCase().includes(needle))
})

const columns = computed<DataTableColumn<Track>[]>(() => [
  { key: 'title', title: copy.value.columns.title },
  { key: 'artist', title: copy.value.columns.artist },
  { key: 'plays', title: copy.value.columns.plays, type: 'number', format: value => Number(value).toLocaleString(isZh.value ? 'zh-CN' : 'en-US') },
])
</script>

<template>
  <div class="data-table-empty-demo not-prose">
    <TxInput v-model="query" class="data-table-empty-demo__search" :placeholder="copy.search" :aria-label="copy.search" clearable />

    <TxDataTable :columns="columns" :data="visibleRows" row-key="id">
      <template #empty>
        <TxEmptyState
          variant="search-empty"
          size="small"
          :title="copy.emptyTitle(query.trim())"
          :description="copy.emptyDescription"
          :primary-action="{ label: copy.clear, variant: 'secondary' }"
          @primary="query = ''"
        />
      </template>
    </TxDataTable>
  </div>
</template>

<style scoped>
.data-table-empty-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.data-table-empty-demo__search {
  max-width: 280px;
}
</style>
