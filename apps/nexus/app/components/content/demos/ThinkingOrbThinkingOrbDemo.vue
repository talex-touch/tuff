<script setup lang="ts">
import { ref } from 'vue'

const FORMS = [
  'working',
  'searching',
  'solving',
  'listening',
  'connecting',
  'weaving',
  'composing',
  'breathing',
  'shaping',
] as const

// Remounting is the only way to reroll a random orb, so the demo bumps a key.
const rollKey = ref(0)
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center gap-3">
      <TxThinkingOrb :key="rollKey" :size="64" />
      <button
        type="button"
        class="rounded-lg border border-[var(--tx-border-color)] px-3 py-1 text-sm"
        @click="rollKey++"
      >
        Reroll (remount)
      </button>
      <span class="text-sm text-[var(--tx-text-color-secondary)]">
        `state` defaults to random and is fixed per mount.
      </span>
    </div>

    <div class="flex flex-wrap gap-4">
      <div
        v-for="form in FORMS"
        :key="form"
        class="flex flex-col items-center gap-1"
      >
        <TxThinkingOrb :state="form" :size="20" />
        <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ form }}</span>
      </div>
    </div>
  </div>
</template>
