<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const errorValue = ref<TxSelectValue>('')
const warningValue = ref<TxSelectValue>('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      errorPlaceholder: '错误状态',
      warningPlaceholder: '警告状态',
      hint: '状态只改变视觉边框，校验文案仍建议放在表单项里。',
      options: [
        { value: 'stable', label: '稳定' },
        { value: 'beta', label: 'Beta' },
      ],
    }
  }

  return {
    errorPlaceholder: 'Error status',
    warningPlaceholder: 'Warning status',
    hint: 'Status changes the visual border only; validation copy still belongs in the form item.',
    options: [
      { value: 'stable', label: 'Stable' },
      { value: 'beta', label: 'Beta' },
    ],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect
      v-model="errorValue"
      status="error"
      :options="labels.options"
      :placeholder="labels.errorPlaceholder"
    />
    <TuffSelect
      v-model="warningValue"
      status="warning"
      :options="labels.options"
      :placeholder="labels.warningPlaceholder"
    />

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="select-demo__hint">
        {{ labels.hint }}
      </div>
    </TxCard>
  </div>
</template>

<style scoped>
.select-demo__hint {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
