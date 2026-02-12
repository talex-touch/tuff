<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const visible = ref(false)
const prefersReducedMotion = ref(false)
const visibilityThreshold = 240

function updateVisibility() {
  visible.value = window.scrollY > visibilityThreshold
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion.value ? 'auto' : 'smooth' })
}

let motionQuery: MediaQueryList | null = null
let motionListener: ((event: MediaQueryListEvent) => void) | null = null

onMounted(() => {
  updateVisibility()
  window.addEventListener('scroll', updateVisibility, { passive: true })

  if ('matchMedia' in window) {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefersReducedMotion.value = motionQuery.matches
    motionListener = (event) => {
      prefersReducedMotion.value = event.matches
    }
    if (motionQuery.addEventListener)
      motionQuery.addEventListener('change', motionListener)
    else if (motionQuery.addListener)
      motionQuery.addListener(motionListener)
  }
})

onUnmounted(() => {
  window.removeEventListener('scroll', updateVisibility)
  if (motionQuery && motionListener) {
    if (motionQuery.removeEventListener)
      motionQuery.removeEventListener('change', motionListener)
    else if (motionQuery.removeListener)
      motionQuery.removeListener(motionListener)
  }
})
</script>

<template>
  <Transition name="back-to-top">
    <TxButton v-show="visible" circle size="small" variant="ghost" native-type="button" class="back-to-top" aria-label="Back to top" @click="scrollToTop">
      <span class="back-to-top__icon i-carbon-chevron-up" aria-hidden="true" />
    </TxButton>
  </Transition>
</template>

<style scoped>
.back-to-top {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 40;
}

.back-to-top__icon {
  font-size: 20px;
  animation: back-to-top-float 2.4s ease-in-out infinite;
}

@keyframes back-to-top-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

.back-to-top-enter-active,
.back-to-top-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.back-to-top-enter-from,
.back-to-top-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

@media (max-width: 640px) {
  .back-to-top {
    right: 16px;
    bottom: 16px;
    width: 40px;
    height: 40px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .back-to-top,
  .back-to-top-enter-active,
  .back-to-top-leave-active {
    transition: none;
  }
  .back-to-top__icon {
    animation: none;
  }
}

::global(.dark .back-to-top),
::global([data-theme='dark'] .back-to-top) {
  border-color: rgba(148, 163, 184, 0.32);
  background: rgba(15, 23, 42, 0.75);
  color: rgba(226, 232, 240, 0.85);
  box-shadow: 0 16px 34px rgba(2, 6, 23, 0.55);
}

::global(.dark .back-to-top:hover),
::global([data-theme='dark'] .back-to-top:hover) {
  box-shadow: 0 20px 42px rgba(2, 6, 23, 0.6);
}
</style>
