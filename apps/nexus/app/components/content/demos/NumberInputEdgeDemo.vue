<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { defaultRow: '默认', focusRow: '聚焦（点击或按 Tab）', errorRow: '错误', disabledRow: '禁用', errorMessage: '数量需在 1 到 99 之间' }
  }
  return { defaultRow: 'Default', focusRow: 'Focus (click or Tab)', errorRow: 'Error', disabledRow: 'Disabled', errorMessage: 'Quantity must be between 1 and 99' }
})

const model = reactive({ plain: 1, value: 1 })
const form = ref<{ setErrors: (errors: Record<string, string>) => void } | null>(null)

onMounted(() => form.value?.setErrors({ value: labels.value.errorMessage }))
</script>

<template>
  <TxForm ref="form" class="number-input-edge-demo not-prose" :model="model">
    <TxFormItem :label="labels.defaultRow">
      <TxNumberInput v-model="model.plain" />
    </TxFormItem>
    <TxFormItem :label="labels.focusRow">
      <TxNumberInput />
    </TxFormItem>
    <TxFormItem :label="labels.errorRow" prop="value">
      <TxNumberInput v-model="model.value" />
    </TxFormItem>
    <TxFormItem :label="labels.disabledRow">
      <TxNumberInput disabled :model-value="1" />
    </TxFormItem>
  </TxForm>
</template>

<style scoped>
.number-input-edge-demo {
  max-width: 360px;
}
</style>
