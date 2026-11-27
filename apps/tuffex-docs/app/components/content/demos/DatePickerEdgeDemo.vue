<script setup lang="ts">
import { computed, reactive } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { defaultRow: '默认', focusRow: '聚焦（点击或按 Tab）', disabledRow: '禁用', placeholder: '选择日期' }
  }
  return { defaultRow: 'Default', focusRow: 'Focus (click or Tab)', disabledRow: 'Disabled', placeholder: 'Select date' }
})

const model = reactive({ date: '2026-11-04', focus: '' })
</script>

<template>
  <TxForm class="date-picker-edge-demo not-prose" :model="model">
    <TxFormItem :label="labels.defaultRow">
      <TxDatePicker v-model="model.date" variant="field" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.focusRow">
      <TxDatePicker v-model="model.focus" variant="field" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.disabledRow">
      <TxDatePicker v-model="model.date" disabled variant="field" />
    </TxFormItem>
  </TxForm>
</template>

<style scoped>
.date-picker-edge-demo {
  max-width: 360px;
}
</style>
