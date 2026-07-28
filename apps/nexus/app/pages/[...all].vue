<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { defineAsyncComponent } from 'vue'
import { hasWindow } from '@talex-touch/utils/env'

const LazyEventHorizon = defineAsyncComponent(() => import('~/components/tuff/background/EventHorizon.vue'))

definePageMeta({
  layout: false,
})

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const pageTitle = computed(() => `${t('notFound.title')} · Tuff Nexus`)
useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
  description: computed(() => t('notFound.seoDescription', { path: route.path })),
  robots: 'noindex, nofollow',
})

if (import.meta.server) {
  const event = useRequestEvent()
  if (event)
    setResponseStatus(event, 404)
}

function goBack() {
  if (window.history.length > 2) {
    router.back()
  }
  else {
    router.push('/')
  }
}

function goHome() {
  router.push('/')
}

// The WebGL singularity is aligned to the hero's "0" slot: measure the
// placeholder rect and hand it to the shader as a focus circle in CSS px.
const stageRef = useTemplateRef<HTMLElement>('stageRef')
const holeRef = useTemplateRef<HTMLElement>('holeRef')
const focus = ref<{ x: number, y: number, r: number } | null>(null)
let resizeObserver: ResizeObserver | null = null

function measureHole() {
  const stage = stageRef.value
  const hole = holeRef.value
  if (!stage || !hole)
    return

  const stageRect = stage.getBoundingClientRect()
  const holeRect = hole.getBoundingClientRect()
  focus.value = {
    x: holeRect.left + holeRect.width / 2 - stageRect.left,
    y: holeRect.top + holeRect.height / 2 - stageRect.top,
    r: (Math.min(holeRect.width, holeRect.height) / 2) * 0.96,
  }
}

const parallax = ref({ x: 0, y: 0 })

function onPointerMove(event: PointerEvent) {
  if (!hasWindow())
    return
  parallax.value = {
    x: (event.clientX / window.innerWidth - 0.5) * -10,
    y: (event.clientY / window.innerHeight - 0.5) * -8,
  }
}

onMounted(() => {
  measureHole()
  document.fonts?.ready.then(() => measureHole()).catch(() => {})
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(measureHole)
    if (stageRef.value)
      resizeObserver.observe(stageRef.value)
    if (holeRef.value)
      resizeObserver.observe(holeRef.value)
  }
  window.addEventListener('resize', measureHole, { passive: true })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (hasWindow())
    window.removeEventListener('resize', measureHole)
})
</script>

<template>
  <div
    ref="stageRef"
    class="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#f4f7fb] dark:bg-[#04060b]"
    @pointermove="onPointerMove"
  >
    <!-- CSS fallback (SSR first paint & no-WebGL environments) -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute left-1/4 top-1/3 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div class="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
    </div>

    <!-- OGL singularity field -->
    <ClientOnly>
      <div class="nf-canvas pointer-events-none absolute inset-0">
        <LazyEventHorizon :focus="focus" class="h-full w-full" />
      </div>
    </ClientOnly>

    <main
      class="nf-main relative z-10 px-6 text-center"
      :style="{ transform: `translate3d(${parallax.x}px, ${parallax.y}px, 0)` }"
    >
      <!-- 404 hero: the zero is the event horizon rendered by the shader -->
      <div class="nf-hero relative mb-6 select-none" style="--nf-delay: 0ms" role="img" aria-label="404">
        <div class="flex items-center justify-center text-[clamp(8rem,24vw,15rem)] font-black leading-none tracking-tight">
          <span
            class="nf-digit nf-digit-l bg-gradient-to-b from-black/85 to-black/15 bg-clip-text text-transparent drop-shadow-[0_0_32px_rgba(27,181,244,0.12)] dark:from-white/90 dark:to-white/10"
            aria-hidden="true"
          >4</span>
          <span ref="holeRef" class="mx-[0.045em] inline-block h-[0.76em] w-[0.76em]" aria-hidden="true" />
          <span
            class="nf-digit nf-digit-r bg-gradient-to-b from-black/85 to-black/15 bg-clip-text text-transparent drop-shadow-[0_0_32px_rgba(124,92,255,0.12)] dark:from-white/90 dark:to-white/10"
            aria-hidden="true"
          >4</span>
        </div>
      </div>

      <!-- Text content -->
      <h1 class="nf-item text-3xl font-semibold tracking-tight text-black dark:text-white sm:text-4xl" style="--nf-delay: 140ms">
        {{ t('notFound.title') }}
      </h1>

      <p class="nf-item mx-auto mt-4 max-w-md text-base text-black/50 dark:text-white/45" style="--nf-delay: 220ms">
        {{ t('notFound.description') }}
      </p>

      <!-- Actions -->
      <div class="nf-item mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4" style="--nf-delay: 320ms">
        <TxButton variant="primary" size="lg" class="w-full sm:w-auto" @click="goHome">
          <span class="i-carbon-home text-lg" />
          {{ t('notFound.backHome') }}
        </TxButton>
        <TxButton variant="secondary" size="lg" class="w-full sm:w-auto" @click="goBack">
          <span class="i-carbon-arrow-left text-lg" />
          {{ t('notFound.goBack') }}
        </TxButton>
      </div>
    </main>

    <!-- Footer -->
    <div class="absolute bottom-6 left-0 right-0 z-10 text-center text-xs text-black/30 dark:text-white/30">
      Tuff © {{ new Date().getFullYear() }}
    </div>
  </div>
</template>

<style scoped>
.nf-main {
  transition: transform 0.4s cubic-bezier(0.22, 0.68, 0, 1);
  will-change: transform;
}

.nf-item,
.nf-hero {
  animation: nf-enter 0.9s cubic-bezier(0.22, 0.68, 0, 1) both;
  animation-delay: var(--nf-delay, 0ms);
}

.nf-canvas {
  animation: nf-fade 1.6s ease 0.1s both;
}

.nf-digit-l {
  animation: nf-float 9s ease-in-out infinite;
}

.nf-digit-r {
  animation: nf-float 9s ease-in-out 4.5s infinite;
}

@keyframes nf-enter {
  from {
    opacity: 0;
    transform: translateY(16px);
    filter: blur(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

@keyframes nf-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes nf-float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-0.035em);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nf-item,
  .nf-hero,
  .nf-canvas,
  .nf-digit-l,
  .nf-digit-r {
    animation: none !important;
  }

  .nf-main {
    transform: none !important;
    transition: none;
  }
}
</style>
