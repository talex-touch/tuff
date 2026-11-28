<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const visible = ref(false)
let rafId: number | null = null

function update() {
  if (!hasWindow())
    return
  visible.value = window.scrollY > 280
}

function onScroll() {
  if (!hasWindow() || rafId !== null)
    return
  rafId = window.requestAnimationFrame(() => {
    rafId = null
    update()
  })
}

function scrollToTop() {
  if (!hasWindow())
    return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' })
}

onMounted(() => {
  if (!hasWindow())
    return
  update()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  if (!hasWindow())
    return
  window.removeEventListener('scroll', onScroll)
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }
})
</script>

<template>
  <Transition name="docs-btt">
    <button
      v-show="visible"
      type="button"
      class="docs-back-to-top"
      aria-label="Back to top"
      @click="scrollToTop"
    >
      <span class="i-carbon-arrow-up" aria-hidden="true" />
    </button>
  </Transition>
</template>

<style scoped>
.docs-back-to-top {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 40;
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--docs-surface, #ffffff);
  color: var(--docs-ink-regular);
  box-shadow:
    inset 0 0 0 1px var(--docs-border),
    0 8px 24px rgba(15, 23, 42, 0.12);
  font-size: 16px;
  cursor: pointer;
}

.docs-back-to-top:hover {
  color: var(--docs-accent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--docs-accent) 45%, transparent),
    0 10px 26px rgba(15, 23, 42, 0.16);
}

.docs-btt-enter-active,
.docs-btt-leave-active {
  transition: opacity 180ms ease, transform 200ms ease;
}

.docs-btt-enter-from,
.docs-btt-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .docs-btt-enter-active,
  .docs-btt-leave-active {
    transition: none;
  }
}
</style>
