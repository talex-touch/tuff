<script setup lang="ts">
import type { OrbState } from '@talex-touch/tuffex/thinking-orb'
import { ORB_PALETTES, ORB_STATE_PALETTES, ORB_STATES } from '@talex-touch/tuffex/thinking-orb'
import { computed } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const LABELS: Record<OrbState, readonly [zh: string, en: string]> = {
  working: ['正在执行', 'Working'],
  searching: ['正在搜索', 'Searching'],
  solving: ['正在求解', 'Solving'],
  listening: ['正在聆听', 'Listening'],
  connecting: ['正在连接', 'Connecting'],
  weaving: ['正在编织', 'Weaving'],
  composing: ['正在撰写', 'Composing'],
  breathing: ['正在思考', 'Thinking'],
  shaping: ['正在塑形', 'Shaping'],
}

// The label borrows the orb's stops, pulled a little toward the text colour
// so it holds contrast on either theme.
function textInk(stops: readonly string[]): string {
  return `linear-gradient(90deg, ${stops.map(stop => `color-mix(in srgb, ${stop} 78%, var(--tx-text-color-primary))`).join(', ')})`
}

// Hard bands, one per stop, like a palette chip.
function swatchInk(stops: readonly string[]): string {
  const step = 100 / stops.length
  return `linear-gradient(90deg, ${stops.map((stop, i) => `${stop} ${i * step}% ${(i + 1) * step}%`).join(', ')})`
}

const rows = computed(() => ORB_STATES.map((state) => {
  const palette = ORB_STATE_PALETTES[state]
  const stops = ORB_PALETTES[palette]
  return {
    state,
    palette,
    label: `${LABELS[state][zh.value ? 0 : 1]}…`,
    text: textInk(stops),
    swatch: swatchInk(stops),
  }
}))
</script>

<template>
  <div class="thinking-orb-gradient-demo">
    <div v-for="row in rows" :key="row.state" class="thinking-orb-gradient-demo__row">
      <!-- The label beside it already announces the status. -->
      <TxThinkingOrb :state="row.state" variant="gradient" aria-hidden="true" />
      <span class="thinking-orb-gradient-demo__label" :style="{ backgroundImage: row.text }">{{ row.label }}</span>
      <span class="thinking-orb-gradient-demo__name">{{ row.state }}</span>
      <span class="thinking-orb-gradient-demo__swatch" :style="{ backgroundImage: row.swatch }" />
      <span class="thinking-orb-gradient-demo__name">{{ row.palette }}</span>
    </div>
  </div>
</template>

<style scoped>
.thinking-orb-gradient-demo {
  width: min(520px, 100%);
}

.thinking-orb-gradient-demo__row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 84px 30px 64px;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
}

.thinking-orb-gradient-demo__row + .thinking-orb-gradient-demo__row {
  border-top: 1px solid var(--tx-border-color-lighter);
}

.thinking-orb-gradient-demo__label {
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
}

.thinking-orb-gradient-demo__name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.thinking-orb-gradient-demo__swatch {
  width: 30px;
  height: 18px;
  border-radius: 5px;
}
</style>
