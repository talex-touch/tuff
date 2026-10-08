<script setup lang="ts">
import type { MorphIconSource } from '../../icon-morph/src/types'
import type { SpringConfig } from '../../liquid/src/spring'
import { computed } from 'vue'
import { TxIconMorph } from '../../icon-morph'
import { APPLE_BUTTON_PATH, MOTION_BUTTON_ICONS } from './icons'

const props = defineProps<{
  icon?: MorphIconSource
  animated: boolean
  filled?: boolean
  spring?: SpringConfig
}>()
const resolved = computed(() => typeof props.icon === 'string'
  ? MOTION_BUTTON_ICONS[props.icon] ?? props.icon
  : props.icon)
</script>

<template>
  <svg v-if="icon === 'apple'" viewBox="0 0 384 512" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path :d="APPLE_BUTTON_PATH" />
  </svg>
  <TxIconMorph
    v-else-if="resolved"
    :key="animated ? 'animated' : 'static'"
    :icon="resolved"
    :size="16"
    :spring="spring ?? { stiffness: 600, damping: 25 }"
    :reduced-motion="animated ? 'user' : 'always'"
    :fill="filled ? 'currentColor' : 'none'"
  />
</template>
