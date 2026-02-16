<script setup lang="ts">
import { ref } from 'vue'

const rebound = ref(0.12)
const maxOffset = ref(26)
</script>

<template>
  <div class="card-inertial-shell">
    <div class="card-inertial-control-row">
      <div class="card-inertial-label">
        rebound
      </div>
      <TxSlider
        v-model="rebound"
        :min="0"
        :max="1"
        :step="0.02"
        show-value
        :format-value="(value) => value.toFixed(2)"
        class="card-inertial-slider"
      />
    </div>

    <div class="card-inertial-control-row">
      <div class="card-inertial-label">
        maxOffset
      </div>
      <TxSlider
        v-model="maxOffset"
        :min="0"
        :max="40"
        :step="1"
        show-value
        class="card-inertial-slider"
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
      <div class="card-demo-title">
        Inertial drag
      </div>
      <div class="card-demo-desc">
        Move mouse around on hover, leave to snap back.
      </div>
    </TxCard>
  </div>
</template>

<style scoped>
.card-inertial-shell {
  width: 520px;
  max-width: 100%;
  padding: 16px;
  overflow: visible;
}

.card-inertial-control-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.card-inertial-label {
  min-width: 84px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.card-inertial-slider {
  flex: 1;
}

.card-demo-title {
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.card-demo-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
