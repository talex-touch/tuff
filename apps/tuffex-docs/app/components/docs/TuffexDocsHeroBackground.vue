<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * R3 Pure CSS Multi-Stop Radial Gradient Wash:
 * - ZERO `filter: blur(72px)` GPU rasterization pass!
 * - Subtle compositor-only floating ribbons pause automatically via
 *   `IntersectionObserver` when scrolled past the hero band, when
 *   `document.hidden` is true, and under `prefers-reduced-motion: reduce`.
 */

const rootRef = ref<HTMLElement | null>(null)
const isPaused = ref(false)

let observer: IntersectionObserver | null = null
let onVisibilityChange: (() => void) | null = null

const shapes = [
  { key: 'indigo', cls: 'is-indigo', width: 520, height: 120, rotate: 12, delay: '0s' },
  { key: 'rose', cls: 'is-rose', width: 420, height: 100, rotate: -14, delay: '1.2s' },
  { key: 'cyan', cls: 'is-cyan', width: 220, height: 56, rotate: -22, delay: '2.4s' },
] as const

onMounted(() => {
  const syncVisibility = () => {
    if (document.hidden)
      isPaused.value = true
  }
  onVisibilityChange = () => {
    if (document.hidden)
      isPaused.value = true
    else if (rootRef.value) {
      const rect = rootRef.value.getBoundingClientRect()
      isPaused.value = rect.bottom <= 0
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  syncVisibility()

  if ('IntersectionObserver' in window && rootRef.value) {
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some(entry => entry.isIntersecting)
        isPaused.value = !visible || document.hidden
      },
      { threshold: 0 },
    )
    observer.observe(rootRef.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  if (onVisibilityChange) {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    onVisibilityChange = null
  }
})
</script>

<template>
  <div ref="rootRef" class="tuffex-hero-bg" :class="{ 'is-paused': isPaused }" aria-hidden="true">
    <div class="tuffex-hero-bg__wash" />
    <div class="tuffex-hero-bg__shapes">
      <div
        v-for="shape in shapes"
        :key="shape.key"
        class="tuffex-hero-bg__shape"
        :class="shape.cls"
        :style="{
          '--shape-w': `${shape.width}px`,
          '--shape-h': `${shape.height}px`,
          '--shape-rot': `${shape.rotate}deg`,
          '--shape-delay': shape.delay,
        }"
      >
        <div class="tuffex-hero-bg__ribbon" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tuffex-hero-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

/* R3: Pure multi-stop radial-gradient wash — ZERO filter: blur()! */
.tuffex-hero-bg__wash {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 56% 42% at 14% 12%, rgba(99, 102, 241, 0.09) 0%, rgba(99, 102, 241, 0.03) 45%, transparent 74%),
    radial-gradient(ellipse 48% 38% at 84% 16%, rgba(244, 63, 94, 0.07) 0%, rgba(244, 63, 94, 0.02) 48%, transparent 72%),
    radial-gradient(ellipse 40% 34% at 52% 4%, rgba(6, 182, 212, 0.06) 0%, transparent 70%);
}

:global(.dark .tuffex-hero-bg__wash),
:global([data-theme='dark'] .tuffex-hero-bg__wash) {
  background:
    radial-gradient(ellipse 56% 42% at 14% 12%, rgba(99, 102, 241, 0.1) 0%, rgba(99, 102, 241, 0.03) 46%, transparent 74%),
    radial-gradient(ellipse 48% 38% at 84% 16%, rgba(244, 63, 94, 0.08) 0%, rgba(244, 63, 94, 0.02) 48%, transparent 72%),
    radial-gradient(ellipse 40% 34% at 52% 4%, rgba(56, 189, 248, 0.06) 0%, transparent 70%);
}

.tuffex-hero-bg__shapes {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.tuffex-hero-bg__shape {
  position: absolute;
  width: var(--shape-w);
  height: var(--shape-h);
  rotate: var(--shape-rot);
}

.tuffex-hero-bg__shape.is-indigo {
  left: -14%;
  top: 14%;
  --ribbon-tint: rgba(99, 102, 241, 0.12);
}

.tuffex-hero-bg__shape.is-rose {
  right: -12%;
  top: 52%;
  --ribbon-tint: rgba(244, 63, 94, 0.1);
}

.tuffex-hero-bg__shape.is-cyan {
  left: 26%;
  top: 6%;
  --ribbon-tint: rgba(6, 182, 212, 0.1);
}

.tuffex-hero-bg__ribbon {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--docs-ink) 6%, transparent);
  background: linear-gradient(90deg, var(--ribbon-tint), transparent);
}

@media (prefers-reduced-motion: no-preference) {
  .tuffex-hero-bg__ribbon {
    animation: tuffex-ribbon-float 14s ease-in-out var(--shape-delay) infinite;
  }

  .tuffex-hero-bg.is-paused .tuffex-hero-bg__ribbon {
    animation-play-state: paused;
  }
}

@keyframes tuffex-ribbon-float {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 14px;
  }
}
</style>
