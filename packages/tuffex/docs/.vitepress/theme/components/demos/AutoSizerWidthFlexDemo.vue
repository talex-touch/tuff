<script setup lang="ts">
import { ref } from 'vue'

const wide = ref(false)
const sizerRef = ref<any>(null)

function toggle() {
  void sizerRef.value?.action?.(() => {
    wide.value = !wide.value
  })
}
</script>

<template>
  <div
    style="width: 520px; max-width: 100%; display: flex; align-items: center; gap: 12px; border: 1px solid var(--tx-border-color); border-radius: 12px; padding: 12px;"
  >
    <TxButton @click="toggle">Toggle</TxButton>

    <TxAutoSizer ref="sizerRef" :width="true" :height="false" outer-class="overflow-hidden">
      <TxButton variant="secondary">{{ wide ? 'Very very long label' : 'Short' }}</TxButton>
    </TxAutoSizer>

    <div style="flex: 1; text-align: right; color: var(--tx-text-color-secondary);">Right Area</div>
  </div>
</template>
