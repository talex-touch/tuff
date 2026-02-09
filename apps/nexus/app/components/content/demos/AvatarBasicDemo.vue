<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? { name: 'Talex 梦魂', fallback: '张' }
  : { name: 'Talex DreamSoul', fallback: 'U' }))
</script>

<template>
  <div style="display: flex; gap: 12px; align-items: center;">
    <TxAvatar src="https://avatars.githubusercontent.com/u/1?v=4" />
    <TxAvatar :name="labels.name" />
    <TxAvatar icon="user" />
    <TxAvatar>{{ labels.fallback }}</TxAvatar>
  </div>
</template>
