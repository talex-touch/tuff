<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref<TxSelectValue>('queue-12')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '选择队列',
      selected: '当前选中',
      hint: 'dropdownMaxHeight 限制面板高度，选中项打开后会滚入可视区域。',
    }
  }

  return {
    placeholder: 'Select queue',
    selected: 'Selected',
    hint: 'dropdownMaxHeight caps panel height and scrolls the selected item into view when opened.',
  }
})

const options = computed(() => {
  return Array.from({ length: 24 }).map((_, index) => {
    const id = index + 1
    return {
      value: `queue-${id}`,
      label: locale.value === 'zh' ? `处理队列 ${id}` : `Processing queue ${id}`,
    }
  })
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect
      v-model="value"
      :placeholder="labels.placeholder"
      :dropdown-max-height="180"
    >
      <TuffSelectItem
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :label="option.label"
      />
    </TuffSelect>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}: {{ value }}
      </div>
      <div class="select-demo__hint">
        {{ labels.hint }}
      </div>
    </TxCard>
  </div>
</template>

<style scoped>
.select-demo__hint {
  margin-top: 4px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
