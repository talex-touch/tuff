<script setup lang="ts">
import { computed, reactive } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { defaultRow: '默认', focusRow: '聚焦（点击或按 Tab）', disabledRow: '禁用', placeholder: '请选择', region: '华东', city: '上海' }
  }
  return { defaultRow: 'Default', focusRow: 'Focus (click or Tab)', disabledRow: 'Disabled', placeholder: 'Please select', region: 'East China', city: 'Shanghai' }
})

const options = computed(() => [
  { value: 'east', label: labels.value.region, children: [{ value: 'shanghai', label: labels.value.city }] },
])

const model = reactive({ path: ['east', 'shanghai'], focus: [] as Array<string | number> })
</script>

<template>
  <TxForm class="cascader-edge-demo not-prose" :model="model">
    <TxFormItem :label="labels.defaultRow">
      <TxCascader v-model="model.path" :options="options" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.focusRow">
      <TxCascader v-model="model.focus" :options="options" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.disabledRow">
      <TxCascader v-model="model.path" disabled :options="options" />
    </TxFormItem>
  </TxForm>
</template>

<style scoped>
.cascader-edge-demo {
  max-width: 360px;
}
</style>
