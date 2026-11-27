<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      primary: '开始配置',
      secondary: '查看指南',
    }
  : {
      primary: 'Get Started',
      secondary: 'Learn More',
    }))
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 16px;">
    <TxGuideState
      :primary-action="{ label: labels.primary, type: 'primary' }"
      :secondary-action="{ label: labels.secondary }"
    />
  </div>
</template>
