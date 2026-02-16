<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      primary: '遮罩背景 + 箭头',
      secondary: '玻璃背景 + 右侧定位',
      triggerA: '状态详情',
      triggerB: '服务状态',
    }
  : {
      primary: 'Mask background + arrow',
      secondary: 'Glass background + right placement',
      triggerA: 'Status detail',
      triggerB: 'Service status',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxTooltip
      :content="labels.primary"
      :anchor="{ showArrow: true, panelBackground: 'mask' }"
    >
      <TxButton variant="ghost">
        {{ labels.triggerA }}
      </TxButton>
    </TxTooltip>

    <TxTooltip
      :content="labels.secondary"
      :anchor="{ placement: 'right', showArrow: true, panelBackground: 'glass', panelShadow: 'medium' }"
    >
      <TxButton variant="ghost">
        {{ labels.triggerB }}
      </TxButton>
    </TxTooltip>
  </div>
</template>
