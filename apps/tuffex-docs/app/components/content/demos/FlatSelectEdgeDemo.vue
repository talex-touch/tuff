<script setup lang="ts">
import { computed, reactive } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { defaultRow: '默认', focusRow: '聚焦（点击或按 Tab）', disabledRow: '禁用', optionA: '选项 A', optionB: '选项 B' }
  }
  return { defaultRow: 'Default', focusRow: 'Focus (click or Tab)', disabledRow: 'Disabled', optionA: 'Option A', optionB: 'Option B' }
})

const model = reactive({ plain: 'a', focus: '' })
</script>

<template>
  <TxForm class="flat-select-edge-demo not-prose" :model="model">
    <TxFormItem :label="labels.defaultRow">
      <TxFlatSelect v-model="model.plain">
        <TxFlatSelectItem value="a" :label="labels.optionA" />
        <TxFlatSelectItem value="b" :label="labels.optionB" />
      </TxFlatSelect>
    </TxFormItem>
    <TxFormItem :label="labels.focusRow">
      <TxFlatSelect v-model="model.focus">
        <TxFlatSelectItem value="a" :label="labels.optionA" />
        <TxFlatSelectItem value="b" :label="labels.optionB" />
      </TxFlatSelect>
    </TxFormItem>
    <TxFormItem :label="labels.disabledRow">
      <TxFlatSelect v-model="model.plain" disabled>
        <TxFlatSelectItem value="a" :label="labels.optionA" />
      </TxFlatSelect>
    </TxFormItem>
  </TxForm>
</template>

<style scoped>
.flat-select-edge-demo {
  max-width: 360px;
}
</style>
