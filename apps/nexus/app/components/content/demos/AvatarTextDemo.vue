<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const texts = computed(() => (locale.value === 'zh'
  ? ['张', '阿博', '用户']
  : ['AL', 'AB', 'User']))
</script>

<template>
  <div style="display: flex; gap: 12px; align-items: center;">
    <TxAvatar>{{ texts[0] }}</TxAvatar>
    <TxAvatar>{{ texts[1] }}</TxAvatar>
    <TxAvatar>{{ texts[2] }}</TxAvatar>
  </div>
</template>
