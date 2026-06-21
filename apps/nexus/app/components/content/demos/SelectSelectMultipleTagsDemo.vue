<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref<TxSelectValue[]>(['a1', 'b2'])

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '选择标签',
      selected: '当前标签',
      hint: '多选模式会以标签返显，点击关闭按钮或按 Backspace 可删除。',
      options: [
        { value: 'a1', label: 'a1' },
        { value: 'b2', label: 'b2' },
        { value: 'c3', label: 'c3' },
        { value: 'd4', label: 'd4' },
      ],
    }
  }

  return {
    placeholder: 'Select tags',
    selected: 'Selected tags',
    hint: 'Multiple mode mirrors selections as tags. Remove them with the close button or Backspace.',
    options: [
      { value: 'a1', label: 'a1' },
      { value: 'b2', label: 'b2' },
      { value: 'c3', label: 'c3' },
      { value: 'd4', label: 'd4' },
    ],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect
      v-model="value"
      multiple
      :options="labels.options"
      :max-tag-count="2"
      :placeholder="labels.placeholder"
    />

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}: {{ value.join(', ') }}
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
