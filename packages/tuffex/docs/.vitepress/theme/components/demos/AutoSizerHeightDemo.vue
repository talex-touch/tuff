<script setup lang="ts">
import { ref } from 'vue'

const active = ref<'a' | 'b'>('a')
const sizerRef = ref<any>(null)

function setTab(next: 'a' | 'b') {
  void sizerRef.value?.action?.(() => {
    active.value = next
  })
}
</script>

<template>
  <div style="width: 420px; max-width: 100%;">
    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
      <TxButton :variant="active === 'a' ? 'primary' : 'secondary'" @click="setTab('a')">
        Tab A
      </TxButton>
      <TxButton :variant="active === 'b' ? 'primary' : 'secondary'" @click="setTab('b')">
        Tab B
      </TxButton>
    </div>

    <TxAutoSizer
      ref="sizerRef"
      :width="false"
      :height="true"
      :duration-ms="250"
      outer-class="overflow-hidden"
      style="border: 1px solid var(--tx-border-color); border-radius: 12px; padding: 12px;"
    >
      <div v-if="active === 'a'">
        <div style="font-weight: 600; margin-bottom: 8px;">
          Tab A
        </div>
        <div style="color: var(--tx-text-color-secondary);">
          Short content.
        </div>
      </div>
      <div v-else>
        <div style="font-weight: 600; margin-bottom: 8px;">
          Tab B
        </div>
        <div style="color: var(--tx-text-color-secondary); line-height: 1.6;">
          Long content. Long content. Long content. Long content. Long content. Long content.
        </div>
        <div style="height: 24px;" />
        <div style="color: var(--tx-text-color-secondary); line-height: 1.6;">
          More lines. More lines. More lines.
        </div>
      </div>
    </TxAutoSizer>
  </div>
</template>
