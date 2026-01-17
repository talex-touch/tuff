<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
const mode = ref<'short' | 'long'>('short')
const sizerRef = ref<any>(null)

function toggleOpen() {
  void sizerRef.value?.action?.(() => {
    open.value = !open.value
  })
}

function toggleItems() {
  void sizerRef.value?.action?.(() => {
    mode.value = mode.value === 'short' ? 'long' : 'short'
  })
}
</script>

<template>
  <div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <TxButton @click="toggleOpen">
        Toggle dropdown
      </TxButton>
      <TxButton @click="toggleItems">
        Toggle items
      </TxButton>
    </div>

    <div style="height: 10px;" />

    <div style="width: 320px; max-width: 100%; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden;">
      <div style="padding: 10px 12px; font-weight: 600;">
        Dropdown Panel (mock)
      </div>
      <TxAutoSizer ref="sizerRef" :width="false" :height="true" outer-class="overflow-hidden" style="padding: 8px 12px;">
        <div v-if="open" style="display: flex; flex-direction: column; gap: 8px;">
          <TxButton variant="secondary" style="justify-content: flex-start;">
            Item A
          </TxButton>
          <TxButton variant="secondary" style="justify-content: flex-start;">
            Item B
          </TxButton>
          <TxButton v-if="mode === 'long'" variant="secondary" style="justify-content: flex-start;">
            Item C
          </TxButton>
          <TxButton v-if="mode === 'long'" variant="secondary" style="justify-content: flex-start;">
            Item D
          </TxButton>
          <TxButton v-if="mode === 'long'" variant="secondary" style="justify-content: flex-start;">
            Item E
          </TxButton>
        </div>
      </TxAutoSizer>
    </div>
  </div>
</template>
