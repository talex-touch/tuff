<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const visiblePx = ref(false)
const visibleRem = ref(false)
const visiblePercent = ref(false)
const visibleFull = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      pxTrigger: 'size px',
      remTrigger: 'size rem',
      percentTrigger: 'size %',
      fullTrigger: 'full 全屏',
      pxTitle: 'size = 400px',
      remTitle: 'size = 24rem',
      percentTitle: 'bottom + size = 55%',
      fullTitle: 'full 全屏抽屉',
      pxBody: '左右方向时，size="400px" 会作为宽度。',
      remBody: '支持 rem 等 CSS 长度。',
      percentBody: '上下方向时，百分比 size 会作为高度。',
      fullBody: 'full prop 会让抽屉在当前方向上 100% 打开；也可以写成 size="full"。',
    }
  : {
      pxTrigger: 'size px',
      remTrigger: 'size rem',
      percentTrigger: 'size %',
      fullTrigger: 'full screen',
      pxTitle: 'size = 400px',
      remTitle: 'size = 24rem',
      percentTitle: 'bottom + size = 55%',
      fullTitle: 'full drawer',
      pxBody: 'For left/right directions, size="400px" becomes width.',
      remBody: 'CSS lengths such as rem are supported.',
      percentBody: 'For top/bottom directions, percentage size becomes height.',
      fullBody: 'The full prop opens the drawer at 100% on the active axis; size="full" is equivalent.',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton @click="visiblePx = true">
      {{ labels.pxTrigger }}
    </TxButton>
    <TxButton @click="visibleRem = true">
      {{ labels.remTrigger }}
    </TxButton>
    <TxButton @click="visiblePercent = true">
      {{ labels.percentTrigger }}
    </TxButton>
    <TxButton @click="visibleFull = true">
      {{ labels.fullTrigger }}
    </TxButton>
  </div>

  <TxDrawer v-model:visible="visiblePx" :title="labels.pxTitle" size="400px" :mobile-adapt="false">
    <p>{{ labels.pxBody }}</p>
  </TxDrawer>
  <TxDrawer v-model:visible="visibleRem" :title="labels.remTitle" size="24rem" :mobile-adapt="false">
    <p>{{ labels.remBody }}</p>
  </TxDrawer>
  <TxDrawer v-model:visible="visiblePercent" :title="labels.percentTitle" direction="bottom" size="55%">
    <p>{{ labels.percentBody }}</p>
  </TxDrawer>
  <TxDrawer v-model:visible="visibleFull" :title="labels.fullTitle" full>
    <p>{{ labels.fullBody }}</p>
  </TxDrawer>
</template>
