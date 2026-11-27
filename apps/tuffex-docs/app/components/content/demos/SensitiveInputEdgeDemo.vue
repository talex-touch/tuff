<script setup lang="ts">
import { computed, reactive } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { defaultRow: '默认', focusRow: '聚焦（点击或按 Tab）', errorRow: '错误', disabledRow: '禁用', placeholder: '输入密钥', errorMessage: '密钥格式不正确' }
  }
  return { defaultRow: 'Default', focusRow: 'Focus (click or Tab)', errorRow: 'Error', disabledRow: 'Disabled', placeholder: 'Enter a secret', errorMessage: 'The secret format is invalid' }
})

const model = reactive({ secret: 'sk-demo-secret' })
</script>

<template>
  <TxForm class="sensitive-input-edge-demo not-prose" :model="model">
    <TxFormItem :label="labels.defaultRow">
      <TxSensitiveInput v-model="model.secret" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.focusRow">
      <TxSensitiveInput :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.errorRow">
      <TxSensitiveInput :error="labels.errorMessage" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.disabledRow">
      <TxSensitiveInput v-model="model.secret" disabled />
    </TxFormItem>
  </TxForm>
</template>

<style scoped>
.sensitive-input-edge-demo {
  max-width: 360px;
}
</style>
