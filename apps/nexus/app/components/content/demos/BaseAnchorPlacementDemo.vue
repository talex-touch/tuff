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
    <TxBaseAnchor v-model="open1" placement="bottom">
      <template #reference>
        <TxButton @click="open1 = !open1">
          {{ labels.bottom }}
        </TxButton>
      </template>
      <template #content>
        <TxCard shadow="soft" :radius="12" :padding="10" style="width: 180px;">
          bottom
        </TxCard>
      </template>
    </TxBaseAnchor>

    <TxBaseAnchor v-model="open2" placement="top">
      <template #reference>
        <TxButton @click="open2 = !open2">
          {{ labels.top }}
        </TxButton>
      </template>
      <template #content>
        <TxCard shadow="soft" :radius="12" :padding="10" style="width: 180px;">
          top
        </TxCard>
      </template>
    </TxBaseAnchor>

    <TxBaseAnchor v-model="open3" placement="left">
      <template #reference>
        <TxButton @click="open3 = !open3">
          {{ labels.left }}
        </TxButton>
      </template>
      <template #content>
        <TxCard shadow="soft" :radius="12" :padding="10" style="width: 180px;">
          left
        </TxCard>
      </template>
    </TxBaseAnchor>

    <TxBaseAnchor v-model="open4" placement="right">
      <template #reference>
        <TxButton @click="open4 = !open4">
          {{ labels.right }}
        </TxButton>
      </template>
      <template #content>
        <TxCard shadow="soft" :radius="12" :padding="10" style="width: 180px;">
          right
        </TxCard>
      </template>
    </TxBaseAnchor>
  </div>
</template>
