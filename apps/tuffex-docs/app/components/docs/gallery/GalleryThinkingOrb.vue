<script setup lang="ts">
import type { OrbState } from '@tuffex-components/thinking-orb'
import { ORB_PALETTES, ORB_STATE_PALETTES } from '@tuffex-components/thinking-orb'
import { computed } from 'vue'

const { locale } = useI18n()
const labels = computed(() => locale.value === 'zh'
  ? { working: '正在执行…', searching: '正在搜索…', solving: '正在求解…' }
  : { working: 'Working…', searching: 'Searching…', solving: 'Solving…' })

const states = ['working', 'searching', 'solving'] as const satisfies readonly OrbState[]

// Each label wears its orb's palette, pulled toward the text colour so it
// reads on either theme.
function ink(state: OrbState): string {
  return `linear-gradient(90deg, ${ORB_PALETTES[ORB_STATE_PALETTES[state]].map(stop => `color-mix(in srgb, ${stop} 78%, var(--tx-text-color-primary))`).join(', ')})`
}
</script>

<template>
  <div class="docs-gallery__stack">
    <div v-for="state in states" :key="state" class="docs-gallery__orb-row">
      <!-- The label beside it already announces the status. -->
      <TxThinkingOrb :state="state" variant="gradient" :label="labels[state]" aria-hidden="true" />
      <span class="docs-gallery__orb-label" :style="{ backgroundImage: ink(state) }">{{ labels[state] }}</span>
    </div>
  </div>
</template>

<style scoped>
/* At the orb's native 20px: the presets are tuned for 20 and 64, and scaling
   a 20 up blurs it. */
.docs-gallery__orb-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.docs-gallery__orb-label {
  font-size: 14px;
  font-weight: 500;
  color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
}
</style>
