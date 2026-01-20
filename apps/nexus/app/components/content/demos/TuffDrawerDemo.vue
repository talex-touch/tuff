<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  triggerLabel?: string
  title?: string
  content?: string
  closeLabel?: string
  width?: string
}>(), {
  triggerLabel: 'Open Drawer',
  title: 'Drawer',
  content: '',
  closeLabel: 'Close',
  width: '420px',
})

const drawerOpen = ref(false)
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton @click="drawerOpen = true">
      {{ props.triggerLabel }}
    </TxButton>
  </div>
  <TxDrawer v-model:visible="drawerOpen" :title="props.title" :width="props.width">
    <div class="space-y-3">
      <p>{{ props.content }}</p>
      <TxButton variant="ghost" @click="drawerOpen = false">
        {{ props.closeLabel }}
      </TxButton>
    </div>
  </TxDrawer>
</template>
