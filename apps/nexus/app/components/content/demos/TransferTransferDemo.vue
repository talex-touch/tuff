<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const selected = ref<Array<string | number>>(['release'])

const items = computed(() => {
  if (locale.value === 'zh') {
    return [
      { key: 'release', label: '正式通道' },
      { key: 'beta', label: 'Beta 通道' },
      { key: 'snapshot', label: '快照通道' },
      { key: 'internal', label: '内部灰度', disabled: true },
    ]
  }

  return [
    { key: 'release', label: 'Release channel' },
    { key: 'beta', label: 'Beta channel' },
    { key: 'snapshot', label: 'Snapshot channel' },
    { key: 'internal', label: 'Internal rollout', disabled: true },
  ]
})

const titles = computed<[string, string]>(() => {
  if (locale.value === 'zh')
    return ['可选渠道', '已选择']
  return ['Available channels', 'Selected']
})

const filterPlaceholder = computed(() => (locale.value === 'zh' ? '筛选渠道' : 'Filter channels'))
const emptyText = computed(() => (locale.value === 'zh' ? '暂无数据' : 'No items'))
</script>

<template>
  <div class="transfer-demo">
    <TxTransfer
      v-model="selected"
      :data="items"
      :titles="titles"
      filterable
      :filter-placeholder="filterPlaceholder"
      :empty-text="emptyText"
    />
  </div>
</template>

<style scoped>
.transfer-demo {
  width: min(100%, 680px);
}
</style>
