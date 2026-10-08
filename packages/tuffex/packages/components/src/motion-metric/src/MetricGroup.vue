<script setup lang="ts">
import type { MotionMetricGroup } from './types'
import { computed, ref } from 'vue'
import { useMetricContext } from './context'
const props = defineProps<{ group: MotionMetricGroup; select?: boolean }>()
defineSlots<{ default: (props: { group: MotionMetricGroup }) => unknown }>()
const ctx = useMetricContext()
const localPeriod = ref<string>()
const period = computed(() => props.group.period ?? localPeriod.value ?? props.group.periods?.[0]?.value ?? '')
const current = computed<MotionMetricGroup>(() => ({ ...props.group, ...props.group.periods?.find(option => option.value === period.value)?.data }))
function choose(value: string): void {
  if (ctx.disabled.value) return
  localPeriod.value = value
  ctx.filterGroup(props.group.id, value)
}
</script>
<template>
  <section class="tx-mm-section">
    <div v-if="group.periods?.length" class="tx-mm-filters">
      <select v-if="select" :value="period" :aria-label="`${group.label}: ${ctx.labels.value.period}`" :disabled="ctx.disabled.value" @change="choose(($event.target as HTMLSelectElement).value)">
<option v-for="option in group.periods" :key="option.value" :value="option.value">
{{ option.label }}
</option>
</select>
      <div v-else class="tx-mm-periods" role="group" :aria-label="`${group.label}: ${ctx.labels.value.period}`">
<button v-for="option in group.periods" :key="option.value" type="button" :aria-pressed="option.value === period" :disabled="ctx.disabled.value" @click="choose(option.value)">
{{ option.label }}
</button>
</div>
    </div>
    <slot :group="current" />
  </section>
</template>
