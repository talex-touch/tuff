<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref<TxSelectValue>('standard')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '请选择',
      selected: '当前选中',
      option1: '标准策略',
      option2: '企业策略',
      option3: '手动策略',
      hint: '禁用选项可见，但不会触发 v-model 或 change。',
    }
  }

  return {
    placeholder: 'Please select',
    selected: 'Selected',
    option1: 'Standard policy',
    option2: 'Enterprise policy',
    option3: 'Manual policy',
    hint: 'Disabled options stay visible but do not update v-model or emit change.',
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect v-model="value" :placeholder="labels.placeholder">
      <TuffSelectItem value="standard" :label="labels.option1" />
      <TuffSelectItem value="enterprise" :label="labels.option2" disabled />
      <TuffSelectItem value="manual" :label="labels.option3" />
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
