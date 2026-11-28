<script setup lang="ts">
import type { OrbState } from '@tuffex-components/thinking-orb'
import { ORB_PALETTES, ORB_STATE_PALETTES } from '@tuffex-components/thinking-orb'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const labels = computed(() => locale.value === 'zh'
  ? { working: '正在执行…', searching: '正在搜索…', solving: '正在求解…' }
  : { working: 'Working…', searching: 'Searching…', solving: 'Solving…' })

const states = ['working', 'searching', 'solving'] as const satisfies readonly OrbState[]
type GalleryOrbState = (typeof states)[number]
const active = ref<GalleryOrbState>('working')

function cycleState(): void {
  const next = (states.indexOf(active.value) + 1) % states.length
  active.value = states[next]!
}

// Each label wears its orb's palette, pulled toward the text colour so it
// reads on either theme.
function ink(state: OrbState): string {
  return `linear-gradient(90deg, ${ORB_PALETTES[ORB_STATE_PALETTES[state]].map(stop => `color-mix(in srgb, ${stop} 78%, var(--tx-text-color-primary))`).join(', ')})`
}
</script>

<template>
  <div class="docs-gallery__orb-stage">
    <button
      type="button"
      class="docs-gallery__orb-hero"
      :aria-label="labels[active]"
      @click="cycleState"
    >
      <TxThinkingOrb :state="active" :size="64" variant="gradient" :label="labels[active]" aria-hidden="true" />
      <span class="docs-gallery__orb-hero-tag">{{ active }}</span>
    </button>

    <div class="docs-gallery__orb-list">
      <button
        v-for="state in states"
        :key="state"
        type="button"
        class="docs-gallery__orb-row"
        :class="{ 'is-active': active === state }"
        :aria-pressed="active === state"
        @click="active = state"
      >
        <TxThinkingOrb :state="state" :size="20" variant="gradient" :label="labels[state]" aria-hidden="true" />
        <span class="docs-gallery__orb-label" :style="{ backgroundImage: ink(state) }">{{ labels[state] }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.docs-gallery__orb-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  width: min(300px, 100%);
}

.docs-gallery__orb-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 16px 10px;
  border: 1px solid var(--docs-gallery-line);
  border-radius: 16px;
  background: color-mix(in srgb, var(--docs-inline-code-bg) 68%, transparent);
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.docs-gallery__orb-hero:hover {
  border-color: color-mix(in srgb, var(--docs-accent) 42%, var(--docs-gallery-line));
}

.docs-gallery__orb-hero-tag {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1;
  color: var(--docs-muted);
}

.docs-gallery__orb-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.docs-gallery__orb-row {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 5px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.docs-gallery__orb-row:hover {
  background: color-mix(in srgb, var(--docs-inline-code-bg) 72%, transparent);
}

.docs-gallery__orb-row.is-active {
  border-color: var(--docs-gallery-line);
  background: var(--tx-bg-color, transparent);
}

.docs-gallery__orb-label {
  font-size: 13px;
  font-weight: 500;
  color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
  white-space: nowrap;
}
</style>
