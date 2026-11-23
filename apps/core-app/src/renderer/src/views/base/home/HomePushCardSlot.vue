<script lang="ts" name="HomePushCardSlot" setup>
import type { ChoiceSelectPayload, ChoiceStep } from '@talex-touch/tuffex/choice-card'
import HomePushCard from './HomePushCard.vue'

/**
 * Animated transition wrapper for `HomePushCard` inside `.HomePage-ComposerGroup`: pins the leaving
 * card directly underneath the composer while the composer docks downward.
 */
defineProps<{
  visible: boolean
  steps: ChoiceStep[]
  selected: string | undefined
  loading: boolean
  loadingRows: number
  settling: boolean
  prevLabel: string
  nextLabel: string
  slotStyle: Record<string, string | number>
}>()

const step = defineModel<number>('step', { required: true })

const emit = defineEmits<{
  (event: 'select', payload: ChoiceSelectPayload): void
}>()
</script>

<template>
  <Transition
    name="home-card"
    appear
    appear-from-class="home-card-appear-from"
    appear-active-class="home-card-appear-active"
  >
    <HomePushCard
      v-if="visible"
      v-model:step="step"
      :steps="steps"
      :selected="selected"
      :loading="loading"
      :loading-rows="loadingRows"
      :settling="settling"
      :prev-label="prevLabel"
      :next-label="nextLabel"
      :slot-style="slotStyle"
      @select="emit('select', $event)"
    />
  </Transition>
</template>

<style lang="scss" scoped>
.home-card-enter-active,
.home-card-appear-active {
  transition:
    opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}

.home-card-enter-active {
  transition-delay: 0.45s;
}

.home-card-appear-active {
  transition-delay: 0.08s;
}

.home-card-enter-from,
.home-card-appear-from {
  opacity: 0;
  transform: translateY(10px);
}

.home-card-leave-active {
  position: absolute;
  top: calc(100% + var(--home-card-gap));
  left: 50%;
  transform: translateX(-50%);
  transition:
    opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-card-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .home-card-leave-active,
  .home-card-enter-active,
  .home-card-appear-active {
    transition: none;
  }
}
</style>
