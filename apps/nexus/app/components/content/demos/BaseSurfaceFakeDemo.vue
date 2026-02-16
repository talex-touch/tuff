<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '伪元素背景',
      desc: 'slot 内容自然在背景上层',
    }
  }

  return {
    title: 'Pseudo-element background',
    desc: 'Slot content naturally sits above background',
  }
})
</script>

<template>
  <div style="display: flex; gap: 16px; flex-wrap: wrap;">
    <TxBaseSurface fake mode="mask" :opacity="0.5" :radius="12" style="width: 200px; height: 100px; display: flex; align-items: center; justify-content: center; flex-direction: column;">
      <strong>{{ labels.title }}</strong>
      <span style="font-size: 12px; opacity: 0.7;">{{ labels.desc }}</span>
    </TxBaseSurface>
    <TxBaseSurface fake mode="pure" :radius="12" color="var(--tx-color-primary-light-9)" style="width: 200px; height: 100px; display: flex; align-items: center; justify-content: center;">
      custom color
    </TxBaseSurface>
  </div>
</template>
