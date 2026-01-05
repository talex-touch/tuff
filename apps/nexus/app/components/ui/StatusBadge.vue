<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    text: string
    status?: 'success' | 'warning' | 'danger' | 'info' | 'muted'
    statusKey?: 'granted' | 'denied' | 'notDetermined' | 'unsupported'
    size?: 'sm' | 'md'
    icon?: string
    os?: 'macos' | 'windows' | 'linux'
    osOnly?: boolean
  }>(),
  {
    text: '',
    status: 'muted',
    statusKey: '',
    size: 'md',
    icon: '',
    os: undefined,
    osOnly: false,
  },
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const sizeClass = computed(() =>
  props.size === 'md'
    ? 'px-2.5 py-1 text-xs'
    : 'px-2 py-0.5 text-[10px]',
)

const statusClass = computed(() => {
  switch (props.status) {
    case 'success':
      return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
    case 'warning':
      return 'border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-300'
    case 'danger':
      return 'border-red-500/20 bg-red-500/15 text-red-600 dark:text-red-300'
    case 'info':
      return 'border-blue-500/20 bg-blue-500/15 text-blue-600 dark:text-blue-300'
    default:
      return 'border-black/10 bg-black/5 text-black/50 dark:border-white/15 dark:bg-white/10 dark:text-white/50'
  }
})

const isVisible = computed(() => {
  if (!props.osOnly || !props.os)
    return true
  if (import.meta.server)
    return true
  const platform = navigator.platform.toLowerCase()
  if (props.os === 'macos')
    return platform.includes('mac')
  if (props.os === 'windows')
    return platform.includes('win')
  if (props.os === 'linux')
    return platform.includes('linux')
  return true
})
</script>

<template>
  <span
    v-if="isVisible"
    class="inline-flex items-center gap-1 rounded-full border font-medium"
    :class="[sizeClass, statusClass]"
    v-bind="$attrs"
    @click="(event) => emit('click', event)"
  >
    <span v-if="icon" :class="icon" class="text-[11px]" aria-hidden="true" />
    <span>{{ text }}</span>
  </span>
</template>
