<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

interface Flavor {
  flavor: string
  category: string
  supplier: string
}

/**
 * Upstream's own cadence: the first delay is a reading pause, so the table
 * stays plain for 1.8s before anything moves.
 */
const STAGE_DELAYS: [number, number, number] = [800, 1000, 1000]

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '提议的菜单精简',
      columns: { flavor: '口味', category: '分类', supplier: '供应商' },
      replay: '重新播放',
      categories: { classic: '经典', retro: '复古', seasonal: '季节限定' },
      hint: '点选变更行可切换是否采纳',
      summary: (c: { removed: number, added: number }) => `删除 ${c.removed} 项 · 新增 ${c.added} 项`,
      apply: (n: number) => `应用 ${n} 项变更`,
      toggle: (accepted: boolean) => (accepted ? '取消采纳这条变更' : '采纳这条变更'),
    }
  }

  return {
    title: 'Proposed menu cleanup',
    columns: { flavor: 'Flavor', category: 'Category', supplier: 'Supplier' },
    replay: 'Replay',
    categories: { classic: 'Classic', retro: 'Retro', seasonal: 'Seasonal' },
    hint: 'Click changed rows to toggle',
    summary: (c: { removed: number, added: number }) =>
      `${c.removed} removal${c.removed === 1 ? '' : 's'} · ${c.added} addition${c.added === 1 ? '' : 's'}`,
    apply: (n: number) => `Apply ${n} change${n === 1 ? '' : 's'}`,
    toggle: (accepted: boolean) => (accepted ? 'Reject this change' : 'Accept this change'),
  }
})

const columns = computed(() => [
  { key: 'flavor', title: copy.value.columns.flavor, width: '34%' },
  // The chip carries its own hue, so the change tone must not repaint it.
  { key: 'category', title: copy.value.columns.category, width: '30%', tintText: false },
  { key: 'supplier', title: copy.value.columns.supplier, width: '36%', strikeOnRemove: true },
])

const rows = computed(() => [
  {
    key: 'rocky-road',
    change: 'removed' as const,
    data: { flavor: 'Rocky Road', category: copy.value.categories.classic, supplier: 'aurora-scoops' } satisfies Flavor,
  },
  {
    key: 'bubblegum',
    change: 'removed' as const,
    data: { flavor: 'Bubblegum', category: copy.value.categories.retro, supplier: 'kumo-creamery' } satisfies Flavor,
  },
  {
    key: 'mint-chip',
    data: { flavor: 'Mint Chip', category: copy.value.categories.classic, supplier: 'maple-orbit' } satisfies Flavor,
  },
  {
    key: 'pistachio',
    change: 'added' as const,
    data: { flavor: 'Pistachio', category: copy.value.categories.seasonal, supplier: 'maple-orbit' } satisfies Flavor,
  },
])

const CATEGORY_DOT: Record<string, string> = {
  Classic: 'var(--tx-bui-accent)',
  经典: 'var(--tx-bui-accent)',
  Retro: 'var(--tx-bui-ink-3)',
  复古: 'var(--tx-bui-ink-3)',
  Seasonal: 'var(--tx-bui-green)',
  季节限定: 'var(--tx-bui-green)',
}

/** Typed structurally so the demo does not depend on the barrel being wired yet. */
const table = ref<{ play: () => void, reset: () => void } | null>(null)

function replay(): void {
  table.value?.reset()
  table.value?.play()
}
</script>

<template>
  <div class="diff-table-demo">
    <TxDiffTable
      ref="table"
      :columns="columns"
      :rows="rows"
      :title="copy.title"
      :hint="copy.hint"
      selectable
      footer
      :summary-formatter="copy.summary"
      :apply-label-formatter="copy.apply"
      :row-toggle-label-formatter="copy.toggle"
      :stage-delays="STAGE_DELAYS"
      play="auto"
    >
      <template #cell-category="{ value }">
        <span class="diff-table-demo__chip">
          <span class="diff-table-demo__dot" :style="{ background: CATEGORY_DOT[value] ?? 'var(--tx-bui-ink-3)' }" />
          {{ value }}
        </span>
      </template>
    </TxDiffTable>

    <TxButton size="sm" variant="secondary" @click="replay">
      {{ copy.replay }}
    </TxButton>
  </div>
</template>

<style scoped>
.diff-table-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
  width: 100%;
  max-width: 380px;
}

.diff-table-demo__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--tx-bui-ink-2, #62656b);
  background: var(--tx-bui-inset, #f7f8f9);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.diff-table-demo__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

</style>
