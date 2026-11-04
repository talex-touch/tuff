<script setup lang="ts">
import type { FormRules } from '@talex-touch/tuffex/form'
import { computed, reactive } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      batch: '单次条数',
      batchHint: '每次请求最多返回的条数。超出部分留到下一次请求，不会丢弃。上限越大，单次请求越慢。',
      batchRequired: '请输入单次条数',
      name: '名称',
      nameHelp: '3 到 20 个字符',
      nameRequired: '请输入名称',
    }
  }

  return {
    batch: 'Results per request',
    batchHint: 'The most results one request returns. Results past the limit wait for the next request; none are dropped. A larger limit makes each request slower.',
    batchRequired: 'Enter a result count',
    name: 'Name',
    nameHelp: '3 to 20 characters',
    nameRequired: 'Enter a name',
  }
})

const form = reactive({ batch: '20', name: '' })

const rules = computed<FormRules>(() => ({
  batch: { required: true, message: labels.value.batchRequired },
  name: { required: true, message: labels.value.nameRequired },
}))
</script>

<template>
  <div class="form-hint-demo not-prose">
    <TxForm :model="form" :rules="rules">
      <TxFormItem :label="labels.batch" prop="batch" :hint="labels.batchHint">
        <TuffInput v-model="form.batch" inputmode="numeric" />
      </TxFormItem>
      <TxFormItem :label="labels.name" prop="name" :help="labels.nameHelp">
        <TuffInput v-model="form.name" />
      </TxFormItem>
    </TxForm>
  </div>
</template>

<style scoped>
.form-hint-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(100%, 560px);
}
</style>
