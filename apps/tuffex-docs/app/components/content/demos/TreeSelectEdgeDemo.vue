<script setup lang="ts">
import { computed, reactive } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { defaultRow: '默认', focusRow: '聚焦（点击或按 Tab）', disabledRow: '禁用', placeholder: '请选择', root: '全部部门', leaf: '工程部' }
  }
  return { defaultRow: 'Default', focusRow: 'Focus (click or Tab)', disabledRow: 'Disabled', placeholder: 'Please select', root: 'All teams', leaf: 'Engineering' }
})

const nodes = computed(() => [
  { key: 'root', label: labels.value.root, children: [{ key: 'engineering', label: labels.value.leaf }] },
])

const model = reactive({ key: 'engineering', focus: undefined as string | undefined })
</script>

<template>
  <TxForm class="tree-select-edge-demo not-prose" :model="model">
    <TxFormItem :label="labels.defaultRow">
      <TxTreeSelect v-model="model.key" :nodes="nodes" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.focusRow">
      <TxTreeSelect v-model="model.focus" :nodes="nodes" :placeholder="labels.placeholder" />
    </TxFormItem>
    <TxFormItem :label="labels.disabledRow">
      <TxTreeSelect v-model="model.key" disabled :nodes="nodes" />
    </TxFormItem>
  </TxForm>
</template>

<style scoped>
.tree-select-edge-demo {
  max-width: 360px;
}
</style>
