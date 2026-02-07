<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? { status: '进行中' }
  : { status: 'Running' }))
</script>

<template>
  <div class="tuff-demo-row">
    <TuffProgress :percentage="60" style="width: 220px;" />
    <TxStatusBadge :text="labels.status" status="warning" />
  </div>
</template>
