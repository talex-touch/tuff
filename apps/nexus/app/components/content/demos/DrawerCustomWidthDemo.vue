<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const visible4 = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxButton @click="visible4 = true">
自定义宽度 (400px)
</TxButton>
        <TxDrawer v-model:visible="visible4" title="固定宽度抽屉" width="400px">
          <p>这个抽屉的宽度是固定的 400px</p>
        </TxDrawer>
  </div>
  <div v-else>
        <TxButton @click="visible4 = true">
Custom width (400px)
</TxButton>
        <TxDrawer v-model:visible="visible4" title="Fixed Width" width="400px">
          <p>This drawer stays at 400px wide.</p>
        </TxDrawer>
  </div>
</template>
