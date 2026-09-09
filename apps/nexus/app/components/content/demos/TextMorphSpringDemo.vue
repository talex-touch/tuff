<script setup lang="ts">
import { computed, ref } from 'vue'

const values = ['Settling', 'Overshooting', 'Landing softly']
const index = ref(0)
const value = computed(() => values[index.value] ?? '')

const rows = [
  { key: 'snappy', label: 'snappy', spring: 'snappy' as const },
  { key: 'smooth', label: 'smooth', spring: 'smooth' as const },
  { key: 'bouncy', label: 'bouncy', spring: 'bouncy' as const },
  { key: 'custom', label: 'stiffness 200 / damping 20', spring: { stiffness: 200, damping: 20 } },
]

function next() {
  index.value = (index.value + 1) % values.length
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 14px;">
    <TxButton @click="next">
      Change value
    </TxButton>

    <TxCard variant="plain" background="mask" :padding="16" :radius="14">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div
          v-for="row in rows"
          :key="row.key"
          style="display: flex; align-items: baseline; gap: 14px;"
        >
          <code style="font-size: 11px; opacity: 0.6; min-width: 200px;">{{ row.label }}</code>
          <div style="font-size: 18px; font-weight: 600;">
            <TxTextMorph :text="value" :spring="row.spring" />
          </div>
        </div>
      </div>
    </TxCard>

    <div style="font-size: 12px; opacity: 0.65;">
      A spring supplies both the curve and the duration, so <code>durationMs</code> and
      <code>easing</code> are ignored while one is set. The presets are the same
      <code>snappy</code> / <code>smooth</code> / <code>bouncy</code> the rest of TuffEx
      animates on.
    </div>
  </div>
</template>
