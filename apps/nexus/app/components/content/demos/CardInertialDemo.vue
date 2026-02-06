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
      <TxSlider
        v-model="rebound"
        :min="0"
        :max="1"
        :step="0.02"
        show-value
        :format-value="(value) => value.toFixed(2)"
        style="flex: 1;"
      />
    </div>

    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
      <div style="font-size: 12px; opacity: 0.72; min-width: 84px;">
        maxOffset
      </div>
      <TxSlider
        v-model="maxOffset"
        :min="0"
        :max="40"
        :step="1"
        show-value
        style="flex: 1;"
      />
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
