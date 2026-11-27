<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      hintContent: '提示信息',
      hintButton: '悬停查看',
      infoContent: '信息',
      infoButton: '信息',
    }
  : {
      hintContent: 'Hint',
      hintButton: 'Hover me',
      infoContent: 'Info',
      infoButton: 'Info',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxTooltip :content="labels.hintContent">
      <TxButton variant="ghost">
{{ labels.hintButton }}
</TxButton>
    </TxTooltip>
    <TxTooltip :content="labels.infoContent">
      <TxButton variant="ghost">
{{ labels.infoButton }}
</TxButton>
    </TxTooltip>
  </div>
</template>
