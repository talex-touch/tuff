<script lang="ts" setup>
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { useProvideTxIconConfig } from '~/composables/useTxIconConfig'

const TouchRay = defineAsyncComponent(() => import('~/components/tuff/background/TouchRay.vue'))

useProvideTxIconConfig()

const { t } = useI18n()
const shouldMountRay = ref(false)
let idleId: number | null = null
let frameId: number | null = null

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return

  const mount = () => {
    idleId = null
    frameId = null
    shouldMountRay.value = true
  }

  if (typeof window.requestIdleCallback === 'function') {
    idleId = window.requestIdleCallback(mount, { timeout: 900 })
    return
  }
  frameId = window.requestAnimationFrame(mount)
})

onBeforeUnmount(() => {
  if (idleId !== null && 'cancelIdleCallback' in window)
    window.cancelIdleCallback(idleId)
  if (frameId !== null)
    window.cancelAnimationFrame(frameId)
})
</script>

<template>
  <div class="Layout-Store bg-white text-black dark:bg-dark dark:text-light">
    <div class="Layout-Store-Ambient" aria-hidden="true" />
    <div v-if="shouldMountRay" class="Layout-Store-Background z-1" aria-hidden="true">
      <TouchRay :rays-speed="0.85" :light-spread="1.8" :follow-mouse="false" />
    </div>
    <div class="relative z-10 min-h-screen flex flex-col">
      <TheHeader class="z-10" title="Store" />
      <main class="Layout-Store-Main">
        <header class="Layout-Store-Hero">
          <h1 class="Layout-Store-Title">
            {{ t('store.hero.title') }}
          </h1>
          <p class="Layout-Store-Subtitle">
            {{ t('store.hero.subtitle') }}
          </p>
        </header>
        <slot />
      </main>
      <TuffFooter />
    </div>
  </div>
</template>

<style scoped>
.Layout-Store {
  position: relative;
  isolation: isolate;
}

.Layout-Store-Ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(64% 42% at 50% 0%, rgba(59, 130, 246, 0.12), transparent 72%),
    radial-gradient(40% 30% at 80% 8%, rgba(99, 102, 241, 0.08), transparent 70%);
}

.dark .Layout-Store-Ambient {
  background:
    radial-gradient(68% 44% at 50% 0%, rgba(96, 165, 250, 0.14), transparent 72%),
    radial-gradient(42% 32% at 78% 10%, rgba(129, 140, 248, 0.1), transparent 70%);
}

.Layout-Store-Background {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.72;
  animation: store-ray-fade 900ms ease-out both;
  mask-image: radial-gradient(circle at top, #000000 12%, transparent 66%);
}

/*
 * One column shared by the hero and the page: the header reserves 88px for
 * its floating pill, the hero sits just under it, and the page content that
 * follows starts a fixed distance below the subtitle rather than a viewport
 * height away.
 */
.Layout-Store-Main {
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  padding: 7.25rem clamp(1.25rem, 4vw, 3rem) 5rem;
  box-sizing: border-box;
}

.Layout-Store-Hero {
  margin: 0 auto 2.25rem;
  max-width: 40rem;
  text-align: center;
}

.Layout-Store-Title {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3.1rem);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.025em;
}

.Layout-Store-Subtitle {
  margin: 0.7rem 0 0;
  font-size: 1.02rem;
  line-height: 1.55;
  color: color-mix(in srgb, currentColor 68%, transparent);
}

@keyframes store-ray-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 0.72;
  }
}

@media (prefers-reduced-motion: reduce) {
  .Layout-Store-Background {
    animation: none;
  }
}
</style>
