<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const visible2 = ref(false)
const visible3 = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxButton @click="visible2 = true">
左侧抽屉
</TxButton>
        <TxButton @click="visible3 = true">
右侧抽屉
</TxButton>
        <TxDrawer v-model:visible="visible2" title="左侧抽屉" direction="left">
          <p>从左侧滑入的抽屉</p>
        </TxDrawer>
        <TxDrawer v-model:visible="visible3" title="右侧抽屉" direction="right">
          <p>从右侧滑入的抽屉（默认）</p>
        </TxDrawer>
  </div>
  <div v-else>
        <TxButton @click="visible2 = true">
Left Drawer
</TxButton>
        <TxButton @click="visible3 = true">
Right Drawer
</TxButton>
        <TxDrawer v-model:visible="visible2" title="Left Drawer" direction="left">
          <p>Slides in from the left</p>
        </TxDrawer>
        <TxDrawer v-model:visible="visible3" title="Right Drawer" direction="right">
          <p>Slides in from the right (default)</p>
        </TxDrawer>
  </div>
</template>
