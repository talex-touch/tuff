<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      panel: '面板指示点',
      reference: '触发器指示点',
      triggerA: '查看提醒',
      triggerB: '系统状态',
    }
  : {
      panel: 'Panel indicator',
      reference: 'Reference indicator',
      triggerA: 'View notice',
      triggerB: 'System status',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxTooltip
      :content="labels.panel"
      indicator
      indicator-variant="pulse"
      indicator-placement="panel"
    >
      <TxButton variant="ghost">
        {{ labels.triggerA }}
      </TxButton>
    </TxTooltip>

    <TxTooltip
      :content="labels.reference"
      indicator
      indicator-placement="reference"
      indicator-color="#f56c6c"
    >
      <TxButton variant="ghost">
        {{ labels.triggerB }}
      </TxButton>
    </TxTooltip>
  </div>
</template>
