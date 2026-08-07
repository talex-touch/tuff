<script setup lang="ts">
import { computed, ref } from 'vue'

const MAX_TOKENS = 200_000

const used = ref(12_300)

// One sample per level boundary in the component: ok, warning, danger.
const presets = [
  { label: 'ok', value: 12_300 },
  { label: 'warning', value: 172_000 },
  { label: 'danger', value: 196_000 },
]

const percent = computed(() => Math.round((used.value / MAX_TOKENS) * 100))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2">
      <button
        v-for="preset in presets"
        :key="preset.label"
        type="button"
        class="rounded-lg border border-[var(--tx-border-color)] px-3 py-1 text-sm"
        :class="used === preset.value ? 'bg-[var(--tx-fill-color)]' : ''"
        @click="used = preset.value"
      >
        {{ preset.label }}
      </button>
    </div>

    <TxContextIndicator :used-tokens="used" :max-tokens="MAX_TOKENS" />

    <TxContextIndicator :used-tokens="used" :max-tokens="MAX_TOKENS">
      <template #detail="{ ratio }">
        <span class="text-[var(--tx-text-color-secondary)]">
          ({{ Math.round(ratio * 100) }}% used, {{ percent >= 95 ? 'compact soon' : 'healthy' }})
        </span>
      </template>
    </TxContextIndicator>
  </div>
</template>
