<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label?: string
    icon?: string
    color?: string
    background?: string
    border?: string
    size?: 'sm' | 'md'
    closable?: boolean
    disabled?: boolean
  }>(),
  {
    label: '',
    icon: '',
    color: undefined,
    background: '',
    border: '',
    size: 'sm',
    closable: false,
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
  (e: 'close'): void
}>()

const sizeClass = computed(() =>
  props.size === 'md'
    ? 'px-2.5 py-1 text-xs'
    : 'px-2 py-0.5 text-[10px]',
)

const style = computed(() => ({
  color: props.color || undefined,
  backgroundColor: props.background || undefined,
  borderColor: props.border || undefined,
}))
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/5 text-black/70 transition dark:border-white/15 dark:bg-white/10 dark:text-white/70"
    :class="[sizeClass, disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer']"
    :style="style"
    v-bind="$attrs"
    @click="(event) => !disabled && emit('click', event)"
  >
    <span v-if="icon" :class="icon" class="text-xs" aria-hidden="true" />
    <span v-if="label">{{ label }}</span>
    <slot v-else />
    <button
      v-if="closable && !disabled"
      type="button"
      class="i-carbon-close text-[10px] opacity-60 transition hover:opacity-100"
      aria-label="Close"
      @click.stop="emit('close')"
    />
  </span>
</template>
