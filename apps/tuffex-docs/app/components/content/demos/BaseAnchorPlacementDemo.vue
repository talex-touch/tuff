<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const open1 = ref(false)
const open2 = ref(false)
const open3 = ref(false)
const open4 = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      bottom: '下方',
      top: '上方',
      left: '左侧',
      right: '右侧',
    }
  }

  return {
    bottom: 'Bottom',
    top: 'Top',
    left: 'Left',
    right: 'Right',
  }
})
</script>

<template>
  <div style="display: flex; gap: 12px; flex-wrap: wrap; padding: 48px 0; justify-content: center;">
    <TxBaseAnchor v-model="open1" placement="bottom" :show-arrow="true">
      <template #reference>
        <TxButton>{{ labels.bottom }}</TxButton>
      </template>
      <div style="width: 180px; padding: 4px;">
        bottom
      </div>
    </TxBaseAnchor>

    <TxBaseAnchor v-model="open2" placement="top" :show-arrow="true">
      <template #reference>
        <TxButton>{{ labels.top }}</TxButton>
      </template>
      <div style="width: 180px; padding: 4px;">
        top
      </div>
    </TxBaseAnchor>

    <TxBaseAnchor v-model="open3" placement="left" :show-arrow="true">
      <template #reference>
        <TxButton>{{ labels.left }}</TxButton>
      </template>
      <div style="width: 180px; padding: 4px;">
        left
      </div>
    </TxBaseAnchor>

    <TxBaseAnchor v-model="open4" placement="right" :show-arrow="true">
      <template #reference>
        <TxButton>{{ labels.right }}</TxButton>
      </template>
      <div style="width: 180px; padding: 4px;">
        right
      </div>
    </TxBaseAnchor>
  </div>
</template>
