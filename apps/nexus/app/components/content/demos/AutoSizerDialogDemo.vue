<script setup lang="ts">
import { ref } from 'vue'

const mode = ref<'short' | 'long'>('short')
const sizerRef = ref<any>(null)

function toggle() {
  void sizerRef.value?.action?.(() => {
    mode.value = mode.value === 'short' ? 'long' : 'short'
  })
}
</script>

<template>
  <div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <TxButton @click="toggle">
        Toggle content
      </TxButton>
    </div>

    <div style="height: 10px;" />

    <div style="width: 420px; max-width: 100%; border: 1px solid var(--tx-border-color); border-radius: 16px; overflow: hidden;">
      <div style="padding: 12px 14px; font-weight: 600;">
        Dialog (mock)
      </div>

      <TxAutoSizer ref="sizerRef" :width="false" :height="true" outer-class="overflow-hidden" style="padding: 12px 14px;">
        <div v-if="mode === 'short'" style="color: var(--tx-text-color-secondary); line-height: 1.6;">
          Short content.
        </div>
        <div v-else style="color: var(--tx-text-color-secondary); line-height: 1.6;">
          Long content. Long content. Long content. Long content. Long content.
          <div style="height: 12px;" />
          More lines. More lines. More lines.
        </div>
      </TxAutoSizer>

      <div
        style="padding: 12px 14px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--tx-border-color);"
      >
        <TxButton variant="secondary">
          Cancel
        </TxButton>
        <TxButton variant="primary">
          Confirm
        </TxButton>
      </div>
    </div>
  </div>
</template>
