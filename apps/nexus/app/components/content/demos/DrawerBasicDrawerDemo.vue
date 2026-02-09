<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const visible1 = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      trigger: '打开抽屉',
      title: '设置',
      body1: '这是抽屉的内容区域，你可以在这里放置任何内容。',
      body2: '支持自定义宽度、方向和关闭行为。',
    }
  : {
      trigger: 'Open Drawer',
      title: 'Settings',
      body1: 'This is the drawer content area.',
      body2: 'Supports custom width, direction, and close behavior.',
    }))
</script>

<template>
  <TxButton @click="visible1 = true">
    {{ labels.trigger }}
  </TxButton>
  <TxDrawer v-model:visible="visible1" :title="labels.title">
    <p>{{ labels.body1 }}</p>
    <p>{{ labels.body2 }}</p>
  </TxDrawer>
</template>
