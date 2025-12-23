<script setup lang="ts">
import { ref } from 'vue'

const showByIf = ref(true)
const visible = ref(true)
const visibleUnmount = ref(true)
</script>

<template>
  <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; align-items: start;">
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="font-weight: 600;">v-if mount/unmount</div>
        <TxButton size="small" @click="showByIf = !showByIf">Toggle</TxButton>
      </div>
      <div style="display: flex; align-items: center; gap: 10px; height: 28px;">
        <TxSpinner v-if="showByIf" />
        <span style="color: var(--tx-text-color-secondary);">Status: {{ showByIf ? 'mounted' : 'unmounted' }}</span>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="font-weight: 600;">:visible (keep mounted)</div>
        <TxButton size="small" @click="visible = !visible">Toggle</TxButton>
      </div>
      <div style="display: flex; align-items: center; gap: 10px; height: 28px;">
        <TxSpinner :visible="visible" />
        <span style="color: var(--tx-text-color-secondary);">Status: {{ visible ? 'visible' : 'hidden (paused)' }}</span>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="font-weight: 600;">visible + unmountOnHidden</div>
        <TxButton size="small" @click="visibleUnmount = !visibleUnmount">Toggle</TxButton>
      </div>
      <div style="display: flex; align-items: center; gap: 10px; height: 28px;">
        <TxSpinner :visible="visibleUnmount" unmount-on-hidden />
        <span style="color: var(--tx-text-color-secondary);">Status: {{ visibleUnmount ? 'mounted' : 'unmount after leave' }}</span>
      </div>
    </div>
  </div>
</template>
