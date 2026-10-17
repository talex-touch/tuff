<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      primary: '显示箭头',
      secondary: '右侧定位 + 中等阴影',
      triggerA: '状态详情',
      triggerB: '服务状态',
    }
  : {
      primary: 'With arrow',
      secondary: 'Right placement + medium shadow',
      triggerA: 'Status detail',
      triggerB: 'Service status',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxTooltip
      :content="labels.primary"
      :anchor="{ showArrow: true }"
    >
      <TxButton variant="ghost">
        {{ labels.triggerA }}
      </TxButton>
    </TxTooltip>

    <TxTooltip
      :content="labels.secondary"
      :anchor="{ placement: 'right', showArrow: true, panelShadow: 'medium' }"
    >
      <TxButton variant="ghost">
        {{ labels.triggerB }}
      </TxButton>
    </TxTooltip>
  </div>
</template>
