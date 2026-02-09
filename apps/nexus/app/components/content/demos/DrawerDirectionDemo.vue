<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const visible2 = ref(false)
const visible3 = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      leftTrigger: '左侧抽屉',
      rightTrigger: '右侧抽屉',
      leftTitle: '左侧抽屉',
      rightTitle: '右侧抽屉',
      leftBody: '从左侧滑入的抽屉',
      rightBody: '从右侧滑入的抽屉（默认）',
    }
  : {
      leftTrigger: 'Left Drawer',
      rightTrigger: 'Right Drawer',
      leftTitle: 'Left Drawer',
      rightTitle: 'Right Drawer',
      leftBody: 'Slides in from the left',
      rightBody: 'Slides in from the right (default)',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton @click="visible2 = true">
      {{ labels.leftTrigger }}
    </TxButton>
    <TxButton @click="visible3 = true">
      {{ labels.rightTrigger }}
    </TxButton>
  </div>
  <TxDrawer v-model:visible="visible2" :title="labels.leftTitle" direction="left">
    <p>{{ labels.leftBody }}</p>
  </TxDrawer>
  <TxDrawer v-model:visible="visible3" :title="labels.rightTitle" direction="right">
    <p>{{ labels.rightBody }}</p>
  </TxDrawer>
</template>
