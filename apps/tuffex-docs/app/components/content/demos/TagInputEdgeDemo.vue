<script setup lang="ts">
import { computed, reactive } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { defaultRow: '默认', focusRow: '聚焦（点击或按 Tab）', disabledRow: '禁用', placeholder: '添加标签' }
  }
  return { defaultRow: 'Default', focusRow: 'Focus (click or Tab)', disabledRow: 'Disabled', placeholder: 'Add tag' }
})

const model = reactive({ tags: ['设计', '工程'], focus: [] as string[] })
</script>

<template>
  <TxForm class="tag-input-edge-demo not-prose" :model="model">
    <TxFormItem :label="labels.defaultRow">
      <TxTagInput v-model="model.tags" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.focusRow">
      <TxTagInput v-model="model.focus" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.disabledRow">
      <TxTagInput disabled :model-value="['只读']" />
    </TxFormItem>
  </TxForm>
</template>

<style scoped>
.tag-input-edge-demo {
  max-width: 360px;
}
</style>
