<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { defaultRow: '默认', focusRow: '聚焦（点击或按 Tab）', errorRow: '错误', disabledRow: '禁用', placeholder: '请输入', errorMessage: '请输入有效内容' }
  }
  return { defaultRow: 'Default', focusRow: 'Focus (click or Tab)', errorRow: 'Error', disabledRow: 'Disabled', placeholder: 'Enter a value', errorMessage: 'Enter a valid value' }
})

const model = reactive({ plain: '', value: '' })
const form = ref<{ setErrors: (errors: Record<string, string>) => void } | null>(null)

onMounted(() => form.value?.setErrors({ value: labels.value.errorMessage }))
</script>

<template>
  <TxForm ref="form" class="input-edge-demo not-prose" :model="model">
    <TxFormItem :label="labels.defaultRow">
      <TxInput v-model="model.plain" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.focusRow">
      <TxInput :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.errorRow" prop="value">
      <TxInput v-model="model.value" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.disabledRow">
      <TxInput disabled :placeholder="labels.placeholder" />
    </TxFormItem>
  </TxForm>
</template>

<style scoped>
.input-edge-demo {
  max-width: 360px;
}
</style>
