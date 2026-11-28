<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      once: 'once / 入场一次',
      breathe: 'breathe / 循环呼吸',
      hover: 'hover / 悬停触发',
    }
  : {
      once: 'once',
      breathe: 'breathe',
      hover: 'hover me',
    }))
</script>

<template>
  <div class="tuff-logo-stroke-modes-demo">
    <div class="tuff-logo-stroke-modes-demo__item">
      <TxTuffLogoStroke :size="84" mode="once" />
      <span>{{ labels.once }}</span>
    </div>

    <div class="tuff-logo-stroke-modes-demo__item">
      <TxTuffLogoStroke :size="84" mode="breathe" />
      <span>{{ labels.breathe }}</span>
    </div>

    <div class="tuff-logo-stroke-modes-demo__item">
      <TxTuffLogoStroke :size="84" mode="hover" />
      <span>{{ labels.hover }}</span>
    </div>
  </div>
</template>

<style scoped>
.tuff-logo-stroke-modes-demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}

.tuff-logo-stroke-modes-demo__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.tuff-logo-stroke-modes-demo__item span {
  font-size: 12px;
  opacity: 0.72;
}
</style>
