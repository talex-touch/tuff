<script setup lang="ts">
import { ref } from 'vue'

const rebound = ref(0.12)
const maxOffset = ref(26)
</script>

<template>
  <div style="width: 520px; max-width: 100%; padding: 16px; overflow: visible;">
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
      <div style="font-size: 12px; opacity: 0.72; min-width: 84px;">
        rebound
      </div>
      <input v-model.number="rebound" type="range" min="0" max="1" step="0.02" style="flex: 1;">
      <div style="font-size: 12px; opacity: 0.72; width: 52px; text-align: right;">
        {{ rebound.toFixed(2) }}
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
      <div style="font-size: 12px; opacity: 0.72; min-width: 84px;">
        maxOffset
      </div>
      <input v-model.number="maxOffset" type="range" min="0" max="40" step="1" style="flex: 1;">
      <div style="font-size: 12px; opacity: 0.72; width: 52px; text-align: right;">
        {{ maxOffset }}
      </div>
    </div>

    <TxCard
      variant="solid"
      background="glass"
      shadow="none"
      inertial
      :inertial-max-offset="maxOffset"
      :inertial-rebound="rebound"
      :padding="14"
    >
      <div style="font-weight: 600;">
        Inertial drag
      </div>
      <div style="font-size: 12px; opacity: 0.78; margin-top: 6px;">
        Move mouse around on hover, leave to snap back.
      </div>
    </TxCard>
  </div>
</template>
