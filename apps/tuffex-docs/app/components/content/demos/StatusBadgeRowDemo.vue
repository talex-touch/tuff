<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? { online: '在线' }
  : { online: 'Online' }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxAvatar name="TA" />
    <TxStatusBadge :text="labels.online" status="success" />
  </div>
</template>
