<script setup lang="ts">
import type { DataTableColumn, DataTableLoadingVariant } from '@talex-touch/tuffex/data-table'
import { computed, ref } from 'vue'

interface Member {
  id: number
  name: string
  plan: string
  credits: number
  seen: string
}

type DemoState = 'loaded' | 'first-load' | 'refresh'

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

// Held, not timed: each state stays on screen until another is picked, so every
// loading shape can be inspected side by side with the loaded table.
const state = ref<DemoState>('first-load')
const variant = ref<DataTableLoadingVariant>('skeleton')

const copy = computed(() => (isZh.value
  ? {
      variantLabel: '加载样式',
      variants: { overlay: '遮罩', skeleton: '骨架', shimmer: '光带' } as Record<DataTableLoadingVariant, string>,
      stateLabel: '表格状态',
      states: { 'loaded': '已加载', 'first-load': '首屏加载', 'refresh': '刷新' } as Record<DemoState, string>,
      loaded: '数据已就绪。',
      hints: {
        'overlay': {
          'first-load': '还没有任何行：遮罩盖住表格，表格保持空状态的高度，数据为空时不会跳动。',
          'refresh': '遮罩盖住已有的行，刷新完成前点不到它们。',
        },
        'skeleton': {
          'first-load': '还没有任何行：按列宽和对齐画出 4 行骨架，与加载后的行同高。',
          'refresh': '已有的行保持不动，只有表头下方的细条在移动。',
        },
        'shimmer': {
          'first-load': '还没有任何行：光带逐行扫过 4 行占位。',
          'refresh': '已有的行保持可读，光带逐行扫过它们。',
        },
      } as Record<DataTableLoadingVariant, Record<Exclude<DemoState, 'loaded'>, string>>,
      name: '成员',
      plan: '套餐',
      credits: '积分',
      seen: '最近登录',
      rows: [
        { id: 1, name: '林晓', plan: 'Pro', credits: 1280, seen: '2026-10-02 09:41' },
        { id: 2, name: '周越', plan: 'Free', credits: 40, seen: '2026-10-01 22:15' },
        { id: 3, name: '陈佳', plan: 'Team', credits: 9600, seen: '2026-09-30 18:02' },
        { id: 4, name: '吴桐', plan: 'Pro', credits: 0, seen: '2026-09-28 11:37' },
      ],
    }
  : {
      variantLabel: 'Loading style',
      variants: { overlay: 'Overlay', skeleton: 'Skeleton', shimmer: 'Shimmer' } as Record<DataTableLoadingVariant, string>,
      stateLabel: 'Table state',
      states: { 'loaded': 'Loaded', 'first-load': 'First load', 'refresh': 'Refresh' } as Record<DemoState, string>,
      loaded: 'The data is in.',
      hints: {
        'overlay': {
          'first-load': 'No rows yet: the veil covers the table, which keeps the height of its empty state so an empty result does not jump.',
          'refresh': 'The veil covers the rows on screen and takes the clicks until the refresh lands.',
        },
        'skeleton': {
          'first-load': 'No rows yet: four placeholder rows follow the column widths and alignment, as tall as the loaded rows.',
          'refresh': 'The rows stay where they are; only the thin bar under the header moves.',
        },
        'shimmer': {
          'first-load': 'No rows yet: a band of light sweeps across four placeholder rows in turn.',
          'refresh': 'The rows stay readable while the band sweeps across each of them.',
        },
      } as Record<DataTableLoadingVariant, Record<Exclude<DemoState, 'loaded'>, string>>,
      name: 'Member',
      plan: 'Plan',
      credits: 'Credits',
      seen: 'Last sign-in',
      rows: [
        { id: 1, name: 'Marta Halapin', plan: 'Pro', credits: 1280, seen: '2026-10-02 09:41' },
        { id: 2, name: 'Devansh Rao', plan: 'Free', credits: 40, seen: '2026-10-01 22:15' },
        { id: 3, name: 'Ines Almeida', plan: 'Team', credits: 9600, seen: '2026-09-30 18:02' },
        { id: 4, name: 'Tobias Werner', plan: 'Pro', credits: 0, seen: '2026-09-28 11:37' },
      ],
    }))

const columns = computed<DataTableColumn<Member>[]>(() => [
  { key: 'name', title: copy.value.name, minWidth: 160 },
  { key: 'plan', title: copy.value.plan, width: 100 },
  { key: 'credits', title: copy.value.credits, width: 100, align: 'right' },
  { key: 'seen', title: copy.value.seen, width: 170, nowrap: true },
])

const rows = computed<Member[]>(() => (state.value === 'first-load' ? [] : copy.value.rows))
const loading = computed(() => state.value !== 'loaded')
const hint = computed(() => (state.value === 'loaded' ? copy.value.loaded : copy.value.hints[variant.value][state.value]))
const selectedKeys = ref<Array<string | number>>([])

function setState(value: unknown) {
  state.value = value as DemoState
}

function setVariant(value: unknown) {
  variant.value = value as DataTableLoadingVariant
}
</script>

<template>
  <div class="data-table-skeleton-demo not-prose">
    <div class="data-table-skeleton-demo__controls">
      <TxFlatRadio :model-value="variant" size="sm" :aria-label="copy.variantLabel" @update:model-value="setVariant">
        <TxFlatRadioItem value="overlay" :label="copy.variants.overlay" />
        <TxFlatRadioItem value="skeleton" :label="copy.variants.skeleton" />
        <TxFlatRadioItem value="shimmer" :label="copy.variants.shimmer" />
      </TxFlatRadio>
      <TxFlatRadio :model-value="state" size="sm" :aria-label="copy.stateLabel" @update:model-value="setState">
        <TxFlatRadioItem value="loaded" :label="copy.states.loaded" />
        <TxFlatRadioItem value="first-load" :label="copy.states['first-load']" />
        <TxFlatRadioItem value="refresh" :label="copy.states.refresh" />
      </TxFlatRadio>
    </div>

    <TxDataTable
      v-model:selected-keys="selectedKeys"
      :columns="columns"
      :data="rows"
      :loading="loading"
      :loading-variant="variant"
      :skeleton-rows="4"
      row-key="id"
      selectable
      bordered
    />

    <p class="data-table-skeleton-demo__hint">
      {{ hint }}
    </p>
  </div>
</template>

<style scoped>
.data-table-skeleton-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.data-table-skeleton-demo__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.data-table-skeleton-demo__hint {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
}
</style>
