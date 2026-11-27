<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { computed, ref } from 'vue'

interface Release {
  id: number
  code: string
  title: string
  artist: string
  plays: number
  source: string
}

type Width = 'wide' | 'narrow'

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

const width = ref<Width>('wide')
const selectedKeys = ref<Array<string | number>>([])

const copy = computed(() => (isZh.value
  ? {
      widthLabel: '容器宽度',
      widths: { wide: '宽', narrow: '窄' } as Record<Width, string>,
      hints: {
        wide: '没有一列声明宽度：编号、歌手、数字、来源和操作列贴合内容，歌曲列分走剩下的宽度。',
        narrow: '放不下时歌曲列先换行，到 minWidth 再横向滚动；编号随选择列固定在左侧，操作列固定在右侧。',
      } as Record<Width, string>,
      columns: { code: '编号', title: '歌曲', artist: '歌手', plays: '播放量', source: '来源', actions: '操作' },
      edit: '编辑',
      more: '更多',
      releases: [
        ['海边的信（2026 重新混音版）', '林夏', '上游同步'],
        ['晚风车站', '周屿', '手动登记'],
        ['第七个夏天 · 乐队十周年现场', '白鹭乐队', '批量导入'],
        ['玻璃城', '沈南', '上游同步'],
      ],
    }
  : {
      widthLabel: 'Container width',
      widths: { wide: 'Wide', narrow: 'Narrow' } as Record<Width, string>,
      hints: {
        wide: 'No column declares a width: the code, artist, number, source and action columns hug their content, and the track column takes the rest.',
        narrow: 'Short of room, the track column wraps first and scrolls once it reaches its minWidth; the code pins left with the selection column, the actions pin right.',
      } as Record<Width, string>,
      columns: { code: 'Code', title: 'Track', artist: 'Artist', plays: 'Plays', source: 'Source', actions: 'Actions' },
      edit: 'Edit',
      more: 'More',
      releases: [
        ['Letters by the Sea (2026 Remix)', 'Lena Hart', 'Synced'],
        ['Evening Wind Station', 'Owen Vale', 'Manual'],
        ['Seventh Summer · Live', 'The Herons', 'Imported'],
        ['Glass City', 'Mira Sol', 'Synced'],
      ],
    }))

const STATS = [
  { id: 1, code: 'TR-10248', plays: 1_284_000 },
  { id: 2, code: 'TR-10255', plays: 942_500 },
  { id: 3, code: 'TR-10262', plays: 2_031_700 },
  { id: 4, code: 'TR-10269', plays: 486_300 },
]

const rows = computed<Release[]>(() => STATS.map((stat, index) => {
  const [title, artist, source] = copy.value.releases[index]!
  return { ...stat, title: title!, artist: artist!, source: source! }
}))

// Only the wrapping column carries a size, and only as the floor it wraps to.
const columns = computed<DataTableColumn<Release>[]>(() => [
  { key: 'code', title: copy.value.columns.code, fixed: 'left', nowrap: true },
  { key: 'title', title: copy.value.columns.title, minWidth: 160 },
  { key: 'artist', title: copy.value.columns.artist, type: 'tag' },
  { key: 'plays', title: copy.value.columns.plays, type: 'number', format: value => Number(value).toLocaleString(isZh.value ? 'zh-CN' : 'en-US') },
  { key: 'source', title: copy.value.columns.source, type: 'source' },
  { key: 'actions', title: copy.value.columns.actions },
])

function setWidth(value: unknown) {
  width.value = value as Width
}
</script>

<template>
  <div class="data-table-widths-demo not-prose">
    <div>
      <TxFlatRadio :model-value="width" size="sm" :aria-label="copy.widthLabel" @update:model-value="setWidth">
        <TxFlatRadioItem value="wide" :label="copy.widths.wide" />
        <TxFlatRadioItem value="narrow" :label="copy.widths.narrow" />
      </TxFlatRadio>
    </div>

    <div class="data-table-widths-demo__frame" :class="`is-${width}`">
      <TxDataTable
        v-model:selected-keys="selectedKeys"
        :columns="columns"
        :data="rows"
        row-key="id"
        selectable
        scroll-x
      >
        <template #cell-actions>
          <span class="data-table-widths-demo__actions">
            <TxButton variant="secondary" size="sm">{{ copy.edit }}</TxButton>
            <TxIconButton icon="i-carbon-overflow-menu-horizontal" size="sm" :label="copy.more" />
          </span>
        </template>
      </TxDataTable>
    </div>

    <p class="data-table-widths-demo__hint">
      {{ copy.hints[width] }}
    </p>
  </div>
</template>

<style scoped>
.data-table-widths-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.data-table-widths-demo__frame.is-narrow {
  max-width: 480px;
}

.data-table-widths-demo__actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.data-table-widths-demo__hint {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
}
</style>
