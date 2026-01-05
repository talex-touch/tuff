<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'
    value?: string | number
    dot?: boolean
    color?: string
  }>(),
  {
    variant: 'default',
    value: 0,
    dot: false,
    color: undefined,
  },
)

const slots = useSlots()

const toneClass = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'border-blue-500/20 bg-blue-500/15 text-blue-600 dark:text-blue-300'
    case 'success':
      return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
    case 'warning':
      return 'border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-300'
    case 'error':
      return 'border-red-500/20 bg-red-500/15 text-red-600 dark:text-red-300'
    default:
      return 'border-black/10 bg-black/5 text-black/60 dark:border-white/15 dark:bg-white/10 dark:text-white/60'
  }
})

const badgeStyle = computed(() => ({
  color: props.color || undefined,
}))

const hasSlot = computed(() => Boolean(slots.default))
const showValue = computed(() => props.dot || props.value !== undefined)
</script>

<template>
  <span v-if="hasSlot" class="relative inline-flex" v-bind="$attrs">
    <slot />
    <span
      v-if="showValue"
      class="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full border px-1 text-[10px] font-semibold leading-none"
      :class="toneClass"
      :style="badgeStyle"
    >
      <span v-if="!dot">{{ value }}</span>
    </span>
  </span>
  <span
    v-else
    class="inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
    :class="toneClass"
    :style="badgeStyle"
    v-bind="$attrs"
  >
    <span v-if="!dot">{{ value }}</span>
  </span>
</template>
