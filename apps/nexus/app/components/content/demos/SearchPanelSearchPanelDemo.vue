<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const query = ref('')
const selected = ref<string | null>(null)

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '搜索口味…',
      emptyTitle: '没有匹配结果',
      emptyDescription: '换个关键词再试一次',
      hint: '↑ ↓ 移动，Enter 选中，Esc 清空 —— 上游没有任何键盘支持，这是补齐的部分。',
      note: '输入 2 个字符仍无匹配时列表保持空白，满 3 个字符才显示空态，避免打字途中闪烁。',
      picked: '已选择：',
      idle: '选中结果只发事件，不会把文案写回输入框。',
      items: [
        { id: 'a', label: '预测夏季需求', keywords: ['forecast'] },
        { id: 'b', label: '寻找蛋筒供应商', keywords: ['vendor', '供应'] },
        { id: 'c', label: '对比季节性口味' },
        { id: 'd', label: '起草新品上市计划' },
        { id: 'e', label: '检查冷链状态' },
        { id: 'f', label: '审计糖类成本' },
        { id: 'g', label: '下架滞销口味', disabled: true },
      ],
    }
  }

  return {
    placeholder: 'Search flavors…',
    emptyTitle: 'No results found',
    emptyDescription: 'Adjust your search to try again',
    hint: '↑ ↓ to move, Enter to select, Esc to clear — upstream ships no keyboard support at all.',
    note: 'Two characters with no match leaves the list blank; the empty state waits for three, so it never flashes mid-word.',
    picked: 'Selected:',
    idle: 'Selecting emits an event; it does not write the label back into the field.',
    items: [
      { id: 'a', label: 'Forecast summer demand' },
      { id: 'b', label: 'Find waffle cone suppliers', keywords: ['vendor'] },
      { id: 'c', label: 'Compare seasonal flavors' },
      { id: 'd', label: 'Draft flavor launch plan' },
      { id: 'e', label: 'Check cold-chain status' },
      { id: 'f', label: 'Audit sugar costs' },
      { id: 'g', label: 'Retire low sellers', disabled: true },
    ],
  }
})

function onSelect(item: { label: string }) {
  selected.value = item.label
}
</script>

<template>
  <div class="flex flex-wrap items-start gap-4">
    <TxSearchPanel
      v-model="query"
      :items="copy.items"
      :placeholder="copy.placeholder"
      :empty-title="copy.emptyTitle"
      :empty-description="copy.emptyDescription"
      @select="onSelect"
    />

    <div class="flex min-w-48 flex-col gap-2 text-xs text-[var(--tx-text-color-secondary)]">
      <p>{{ copy.hint }}</p>
      <p>{{ copy.note }}</p>
      <p>
        <template v-if="selected">
          {{ copy.picked }} <code>{{ selected }}</code>
        </template>
        <template v-else>
          {{ copy.idle }}
        </template>
      </p>
    </div>
  </div>
</template>
