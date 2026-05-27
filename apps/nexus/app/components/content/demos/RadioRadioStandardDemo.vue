<script setup lang="ts">
import type { TxRadioValue } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref<TxRadioValue>('editor')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      selected: '当前选中',
      options: [
        { value: 'viewer', label: '只读成员' },
        { value: 'editor', label: '编辑成员' },
        { value: 'owner', label: '管理员' },
      ],
    }
  }

  return {
    selected: 'Selected',
    options: [
      { value: 'viewer', label: 'Viewer' },
      { value: 'editor', label: 'Editor' },
      { value: 'owner', label: 'Owner' },
    ],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TxRadioGroup v-model="value" type="standard" direction="row">
      <TxRadio
        v-for="option in labels.options"
        :key="option.value"
        :value="option.value"
        :label="option.label"
      />
    </TxRadioGroup>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}: {{ value }}
      </div>
    </TxCard>
  </div>
</template>
