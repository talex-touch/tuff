<script lang="ts" setup>
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { useProvideTxIconConfig } from '~/composables/useTxIconConfig'

const TouchRay = defineAsyncComponent(() => import('~/components/tuff/background/TouchRay.vue'))

useProvideTxIconConfig()

const { t } = useI18n()
const shouldMountRay = ref(false)
let idleId: number | null = null
let timeoutId: number | null = null

function clearRaySchedule() {
  if (!hasWindow())
    return
  if (idleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(idleId)
    idleId = null
  }
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId)
    timeoutId = null
  }
}

function scheduleRayMount() {
  if (!hasWindow() || !hasDocument())
    return
  if (shouldMountRay.value || document.hidden)
    return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return

  clearRaySchedule()

  const mount = () => {
    idleId = null
    timeoutId = null
    if (!hasDocument() || !hasWindow())
      return
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return
    shouldMountRay.value = true
  }

  const requestIdle = window.requestIdleCallback
  if (requestIdle) {
    idleId = requestIdle(mount, { timeout: 1200 })
    return
  }
  timeoutId = window.setTimeout(mount, 240)
}

function handleVisibilityChange() {
  if (!hasDocument())
    return
  if (document.hidden) {
    clearRaySchedule()
    return
  }
  if (!shouldMountRay.value)
    scheduleRayMount()
}

onMounted(() => {
  if (!hasDocument())
    return
  document.addEventListener('visibilitychange', handleVisibilityChange)
  scheduleRayMount()
})

onBeforeUnmount(() => {
  if (hasDocument())
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  clearRaySchedule()
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
  -webkit-mask-image: radial-gradient(circle at top, #000000 12%, transparent 66%);
}

@keyframes store-ray-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.72;
  }
}

.Layout-Store-Main {
  flex: 1;
  width: 100%;
  max-width: 76rem;
  margin: 0 auto;
  padding: 7.5rem 1.5rem 5rem;
}

.Layout-Store-Hero {
  max-width: 44rem;
  margin: 0 auto 2.5rem;
  text-align: center;
}

.Layout-Store-Title {
  margin: 0;
  font-size: clamp(2rem, 4.5vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.Layout-Store-Subtitle {
  margin: 0.85rem 0 0;
  font-size: 1rem;
  line-height: 1.6;
  color: rgba(15, 23, 42, 0.64);
}

.dark .Layout-Store-Subtitle {
  color: rgba(248, 250, 252, 0.64);
}
</style>
