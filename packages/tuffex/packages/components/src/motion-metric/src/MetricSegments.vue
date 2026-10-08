<!-- Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import { computed } from 'vue'
import { ratio } from './context'
const props = withDefaults(defineProps<{ value?: number; target?: number; min?: number; count?: number; rows?: number; mode?: 'piano' | 'barcode' | 'budget' | 'quota' }>(), { target: 100, min: 0, count: 36, rows: 1, mode: 'piano' })
const fraction = computed(() => ratio(props.value, props.target, props.min))
</script>
<template>
  <div class="tx-mm-segments" :class="`tx-mm-segments--${mode}`" :style="{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }" role="meter" :aria-valuemin="min" :aria-valuemax="target" :aria-valuenow="value" :aria-label="`${value ?? '—'} / ${target}`">
    <span v-for="n in count * rows" :key="n" :class="{ 'is-filled': (n - 1) % count < Math.round(fraction * count) }" />
  </div>
</template>
