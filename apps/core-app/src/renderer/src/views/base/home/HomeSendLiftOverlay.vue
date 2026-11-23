<script lang="ts" name="HomeSendLiftOverlay" setup>
import type { LiftOverlay } from '~/composables/useSendChoreography'
import { ref } from 'vue'

/**
 * Fixed-position send-lift ghost rendered above the stage: `useSendChoreography` lifts typed text
 * off the composer into this bubble and flies it onto the landing user row.
 */
const ghostRef = ref<HTMLElement | null>(null)
const fillRef = ref<HTMLElement | null>(null)
const textRef = ref<HTMLElement | null>(null)

function overlay(): LiftOverlay | null {
  const ghost = ghostRef.value
  const fill = fillRef.value
  const text = textRef.value
  return ghost && fill && text ? { ghost, fill, text } : null
}

defineExpose({ overlay })
</script>

<template>
  <div ref="ghostRef" class="HomePage-SendLift" aria-hidden="true">
    <div ref="fillRef" class="HomePage-SendLiftFill" />
    <div ref="textRef" class="HomePage-UserBubble HomePage-SendLiftText" />
  </div>
</template>

<style lang="scss" scoped>
.HomePage-SendLift {
  position: fixed;
  top: 0;
  left: 0;
  z-index: var(--home-z-lift);
  pointer-events: none;
  visibility: hidden;

  &.is-active {
    visibility: visible;
    will-change: transform;
  }
}

.HomePage-SendLiftFill {
  position: absolute;
  inset: 0;
  border-radius: var(--shell-radius-lg);
  background: var(--shell-surface-2);
  opacity: 0;
}

.HomePage-UserBubble.HomePage-SendLiftText {
  position: relative;
  margin: 0;
  background: none;
}
</style>
