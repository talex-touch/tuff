<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const visible1 = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxButton @click="visible1 = true">
打开抽屉
</TxButton>
        <TxDrawer v-model:visible="visible1" title="设置">
          <p>这是抽屉的内容区域，你可以在这里放置任何内容。</p>
          <p>支持自定义宽度、方向和关闭行为。</p>
        </TxDrawer>
  </div>
  <div v-else>
        <TxButton @click="visible1 = true">
Open Drawer
</TxButton>
        <TxDrawer v-model:visible="visible1" title="Settings">
          <p>This is the drawer content area.</p>
          <p>Supports custom width, direction, and close behavior.</p>
        </TxDrawer>
  </div>
</template>
