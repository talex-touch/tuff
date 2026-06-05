<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref<TxSelectValue>('engineering')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '请选择',
      selected: '当前选中',
      hint: '基础选择器会用选项 label 回填触发器文本。',
      options: [
        { value: 'design', label: '设计团队' },
        { value: 'engineering', label: '工程团队' },
        { value: 'support', label: '支持团队' },
      ],
    }
  }

  return {
    placeholder: 'Please select',
    selected: 'Selected',
    hint: 'The selected option label is mirrored into the trigger input.',
    options: [
      { value: 'design', label: 'Design team' },
      { value: 'engineering', label: 'Engineering team' },
      { value: 'support', label: 'Support team' },
    ],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect v-model="value" :placeholder="labels.placeholder">
      <TuffSelectItem
        v-for="option in labels.options"
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
