<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex/select'
import { computed, ref, useId } from 'vue'

const { locale } = useI18n()
const value = ref<TxSelectValue>('engineering')
const controlId = useId()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      team: '团队',
      placeholder: '请选择',
      selected: '当前选中',
      hint: '点击上方标签可聚焦选择器；id 和可访问名称直接传给内部输入框。',
      options: [
        { value: 'design', label: '设计团队' },
        { value: 'engineering', label: '工程团队' },
        { value: 'support', label: '支持团队' },
      ],
    }
  }

  return {
    team: 'Team',
    placeholder: 'Please select',
    selected: 'Selected',
    hint: 'Click the label to focus the select; id and accessible names reach its input directly.',
    options: [
      { value: 'design', label: 'Design team' },
      { value: 'engineering', label: 'Engineering team' },
      { value: 'support', label: 'Support team' },
    ],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400 not-prose">
    <label :for="controlId">{{ labels.team }}</label>
    <TuffSelect :id="controlId" v-model="value" :placeholder="labels.placeholder" :aria-label="labels.team">
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
