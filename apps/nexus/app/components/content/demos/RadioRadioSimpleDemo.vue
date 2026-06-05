<script setup lang="ts">
import type { TxRadioValue } from '@talex-touch/tuffex/radio'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref<TxRadioValue>('week')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      selected: '当前选中',
      options: [
        { value: 'day', label: '日' },
        { value: 'week', label: '周' },
        { value: 'month', label: '月' },
      ],
    }
  }

  return {
    selected: 'Selected',
    options: [
      { value: 'day', label: 'Day' },
      { value: 'week', label: 'Week' },
      { value: 'month', label: 'Month' },
    ],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col">
    <TxRadioGroup v-model="value">
      <TxRadio
        v-for="option in labels.options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </TxRadio>
    </TxRadioGroup>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}: {{ value }}
      </div>
    </TxCard>
  </div>
</template>
