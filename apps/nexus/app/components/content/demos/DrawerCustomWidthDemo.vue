<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const visible4 = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      trigger: '自定义宽度 (400px)',
      title: '固定宽度抽屉',
      body: '这个抽屉的宽度是固定的 400px',
    }
  : {
      trigger: 'Custom width (400px)',
      title: 'Fixed Width',
      body: 'This drawer stays at 400px wide.',
    }))
</script>

<template>
  <TxButton @click="visible4 = true">
    {{ labels.trigger }}
  </TxButton>
  <TxDrawer v-model:visible="visible4" :title="labels.title" width="400px">
    <p>{{ labels.body }}</p>
  </TxDrawer>
</template>
