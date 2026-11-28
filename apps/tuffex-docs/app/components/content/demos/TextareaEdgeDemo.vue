<script setup lang="ts">
import { computed, reactive } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { defaultRow: '默认', focusRow: '聚焦（点击或按 Tab）', errorRow: '错误', disabledRow: '禁用', placeholder: '请输入多行内容', errorMessage: '内容不能为空' }
  }
  return { defaultRow: 'Default', focusRow: 'Focus (click or Tab)', errorRow: 'Error', disabledRow: 'Disabled', placeholder: 'Enter several lines', errorMessage: 'Content is required' }
})

const model = reactive({ plain: '' })
</script>

<template>
  <TxForm class="textarea-edge-demo not-prose" :model="model">
    <TxFormItem :label="labels.defaultRow">
      <TxTextarea v-model="model.plain" :rows="2" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.focusRow">
      <TxTextarea :rows="2" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.errorRow">
      <TxTextarea status="error" :rows="2" :placeholder="labels.errorMessage" />
    </TxFormItem>
    <TxFormItem :label="labels.disabledRow">
      <TxTextarea disabled :rows="2" :placeholder="labels.placeholder" />
    </TxFormItem>
  </TxForm>
</template>

<style scoped>
.textarea-edge-demo {
  max-width: 360px;
}
</style>
