<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const visibleLeft = ref(false)
const visibleRight = ref(false)
const visibleTop = ref(false)
const visibleBottom = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      leftTrigger: 'Left',
      rightTrigger: 'Right',
      topTrigger: 'Top',
      bottomTrigger: 'Bottom',
      leftTitle: '左侧抽屉',
      rightTitle: '右侧抽屉',
      topTitle: '顶部抽屉',
      bottomTitle: '底部抽屉',
      leftBody: '从左侧滑入，size 作为宽度。',
      rightBody: '从右侧滑入，size 作为宽度。',
      topBody: '从顶部滑入，size 作为高度。',
      bottomBody: '从底部滑入，适合移动端 Bottom Sheet。',
    }
  : {
      leftTrigger: 'Left',
      rightTrigger: 'Right',
      topTrigger: 'Top',
      bottomTrigger: 'Bottom',
      leftTitle: 'Left Drawer',
      rightTitle: 'Right Drawer',
      topTitle: 'Top Drawer',
      bottomTitle: 'Bottom Drawer',
      leftBody: 'Slides in from the left. The size prop becomes width.',
      rightBody: 'Slides in from the right. The size prop becomes width.',
      topBody: 'Slides down from the top. The size prop becomes height.',
      bottomBody: 'Slides up from the bottom, ideal for mobile bottom sheets.',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton @click="visibleLeft = true">
      {{ labels.leftTrigger }}
    </TxButton>
    <TxButton @click="visibleRight = true">
      {{ labels.rightTrigger }}
    </TxButton>
    <TxButton @click="visibleTop = true">
      {{ labels.topTrigger }}
    </TxButton>
    <TxButton @click="visibleBottom = true">
      {{ labels.bottomTrigger }}
    </TxButton>
  </div>
  <TxDrawer v-model:visible="visibleLeft" :title="labels.leftTitle" direction="left" size="360px" :mobile-adapt="false">
    <p>{{ labels.leftBody }}</p>
  </TxDrawer>
  <TxDrawer v-model:visible="visibleRight" :title="labels.rightTitle" direction="right" size="360px" :mobile-adapt="false">
    <p>{{ labels.rightBody }}</p>
  </TxDrawer>
  <TxDrawer v-model:visible="visibleTop" :title="labels.topTitle" direction="top" size="18rem" :mobile-adapt="false">
    <p>{{ labels.topBody }}</p>
  </TxDrawer>
  <TxDrawer v-model:visible="visibleBottom" :title="labels.bottomTitle" direction="bottom" size="45%">
    <p>{{ labels.bottomBody }}</p>
  </TxDrawer>
</template>
