<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '渐变透明分割',
      start: '从起点逐渐显现',
      end: '向终点逐渐透明',
      both: '两端透明，中间清晰',
      label: '渐变标签',
    }
  : {
      title: 'Gradient fade divider',
      start: 'Fade in from the start',
      end: 'Fade out toward the end',
      both: 'Transparent at both ends, clear in the middle',
      label: 'Gradient label',
    }))
</script>

<template>
  <div class="divider-gradient-demo">
    <strong>{{ labels.title }}</strong>
    <span>{{ labels.start }}</span>
    <TxDivider gradient="start" />
    <span>{{ labels.end }}</span>
    <TxDivider gradient="end" />
    <span>{{ labels.both }}</span>
    <TxDivider gradient />
    <TxDivider gradient text-placement="center">
      {{ labels.label }}
    </TxDivider>
  </div>
</template>

<style scoped>
.divider-gradient-demo {
  display: grid;
  gap: 10px;
  width: min(100%, 560px);
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 80%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 92%, transparent);
}

.divider-gradient-demo strong {
  color: var(--tx-text-color-primary);
}

.divider-gradient-demo span {
  color: var(--tx-text-color-secondary);
}
</style>
