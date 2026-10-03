<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
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

// Held, not timed: each state stays on screen until another is picked, so both
// loading shapes can be inspected side by side with the loaded table.
const state = ref<DemoState>('first-load')

const copy = computed(() => (isZh.value
  ? {
      stateLabel: '表格状态',
      states: { 'loaded': '已加载', 'first-load': '首屏加载', 'refresh': '刷新' } as Record<DemoState, string>,
      hints: {
        'loaded': '数据已就绪。',
        'first-load': '还没有任何行：按列宽和对齐画出 4 行骨架，与加载后的行同高。',
        'refresh': '已有的行保持不动，只有表头下方的细条在移动。',
      } as Record<DemoState, string>,
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
      stateLabel: 'Table state',
      states: { 'loaded': 'Loaded', 'first-load': 'First load', 'refresh': 'Refresh' } as Record<DemoState, string>,
      hints: {
        'loaded': 'The data is in.',
        'first-load': 'No rows yet: four placeholder rows follow the column widths and alignment, as tall as the loaded rows.',
        'refresh': 'The rows stay where they are; only the thin bar under the header moves.',
      } as Record<DemoState, string>,
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
const selectedKeys = ref<Array<string | number>>([])

function setState(value: unknown) {
  state.value = value as DemoState
}
</script>

<template>
  <div class="data-table-skeleton-demo not-prose">
    <div>
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
      loading-variant="skeleton"
      :skeleton-rows="4"
      row-key="id"
      selectable
      bordered
    />

    <p class="data-table-skeleton-demo__hint">
      {{ copy.hints[state] }}
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

.data-table-skeleton-demo__hint {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
}
</style>
