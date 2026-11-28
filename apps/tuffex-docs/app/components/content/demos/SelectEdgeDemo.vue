<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { single: '单选 · 默认', multi: '多选 · 默认', focus: '单选 · 聚焦（点击展开）', errorRow: '错误', disabledRow: '禁用', errorMessage: '请选择一个团队', optionA: '工程团队', optionB: '设计团队' }
  }
  return { single: 'Single · default', multi: 'Multiple · default', focus: 'Single · focus (click to open)', errorRow: 'Error', disabledRow: 'Disabled', errorMessage: 'Choose a team', optionA: 'Engineering', optionB: 'Design' }
})

const options = computed(() => [
  { value: 'engineering', label: labels.value.optionA },
  { value: 'design', label: labels.value.optionB },
])

const model = reactive({ single: 'engineering', multi: ['engineering', 'design'], focus: '', error: '' })
const form = ref<{ setErrors: (errors: Record<string, string>) => void } | null>(null)

onMounted(() => form.value?.setErrors({ error: labels.value.errorMessage }))
</script>

<template>
  <TxForm ref="form" class="select-edge-demo not-prose" :model="model">
    <TxFormItem :label="labels.single">
      <TxSelect v-model="model.single" :options="options" />
    </TxFormItem>
    <TxFormItem :label="labels.multi">
      <TxSelect v-model="model.multi" multiple :options="options" />
    </TxFormItem>
    <TxFormItem :label="labels.focus">
      <TxSelect v-model="model.focus" :options="options" />
    </TxFormItem>
    <TxFormItem :label="labels.errorRow" prop="error">
      <TxSelect v-model="model.error" :options="options" />
    </TxFormItem>
    <TxFormItem :label="labels.disabledRow">
      <TxSelect v-model="model.single" disabled :options="options" />
    </TxFormItem>
  </TxForm>
</template>

<style scoped>
.select-edge-demo {
  max-width: 360px;
}
</style>
