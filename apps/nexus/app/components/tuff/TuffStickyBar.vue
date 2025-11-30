<script setup lang="ts">
import { gsap } from 'gsap'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type StickyState = 'idle' | 'active' | 'leaving'

const sentinelRef = ref<HTMLElement | null>(null)
const barRef = ref<HTMLElement | null>(null)
const state = ref<StickyState>('idle')

let observer: IntersectionObserver | null = null
let leaveTimeout: ReturnType<typeof setTimeout> | undefined
let motionCleanup: (() => void) | null = null
let reduceMotion = false
let activeTimeline: gsap.core.Timeline | null = null

const isActive = computed(() => state.value === 'active')
const isLeaving = computed(() => state.value === 'leaving')
const shouldRender = computed(() => state.value !== 'idle')

const LEAVE_DURATION = 680

function clearLeaveTimeout() {
  if (leaveTimeout !== undefined) {
    clearTimeout(leaveTimeout)
    leaveTimeout = undefined
  }
}

function scheduleLeave() {
  clearLeaveTimeout()
  state.value = 'leaving'
  leaveTimeout = setTimeout(() => {
    if (state.value === 'leaving')
      state.value = 'idle'

    clearLeaveTimeout()
  }, LEAVE_DURATION)
}

function killActiveTimeline() {
  if (activeTimeline) {
    activeTimeline.kill()
    activeTimeline = null
  }
}

function playEnter(target: HTMLElement) {
  killActiveTimeline()

  if (reduceMotion) {
    gsap.set(target, {
      'y': 0,
      'scale': 1,
      'opacity': 1,
      '--sticky-bar-blur': '0px',
      'visibility': 'visible',
      'pointerEvents': 'auto',
    })
    return
  }

  activeTimeline = gsap.timeline({
    onComplete: () => {
      gsap.set(target, { willChange: 'auto' })
      activeTimeline = null
    },
  })

  activeTimeline
    .set(target, {
      visibility: 'visible',
      pointerEvents: 'auto',
      willChange: 'transform, opacity, filter',
      opacity: 1,
    })
    .fromTo(target, {
      'y': 96,
      'scale': 0.84,
      'opacity': 0,
      '--sticky-bar-blur': '24px',
    }, {
      'duration': 0.58,
      'y': -14,
      'scale': 1.1,
      'opacity': 1,
      '--sticky-bar-blur': '12px',
      'ease': 'expo.out',
    })
    .to(target, {
      'duration': 0.24,
      'y': 6,
      'scale': 0.94,
      '--sticky-bar-blur': '5px',
      'ease': 'power2.inOut',
    })
    .to(target, {
      'duration': 0.62,
      'y': 0,
      'scale': 1,
      '--sticky-bar-blur': '0px',
      'ease': 'elastic.out(1.04, 0.68)',
    })
}

function playExit(target: HTMLElement) {
  killActiveTimeline()

  if (reduceMotion) {
    gsap.set(target, {
      'y': 0,
      'scale': 1,
      'opacity': 0,
      '--sticky-bar-blur': '24px',
      'visibility': 'hidden',
      'pointerEvents': 'none',
    })
    return
  }

  activeTimeline = gsap.timeline({
    onComplete: () => {
      gsap.set(target, {
        'visibility': 'hidden',
        'pointerEvents': 'none',
        'y': 0,
        'scale': 1,
        'opacity': 0,
        '--sticky-bar-blur': '24px',
        'willChange': 'auto',
      })
      activeTimeline = null
    },
  })

  activeTimeline
    .set(target, {
      pointerEvents: 'none',
      willChange: 'transform, opacity, filter',
    })
    .to(target, {
      'duration': 0.24,
      'y': -8,
      'scale': 1.02,
      '--sticky-bar-blur': '6px',
      'ease': 'power2.inOut',
    })
    .to(target, {
      'duration': 0.44,
      'y': 112,
      'scale': 0.78,
      'opacity': 0,
      '--sticky-bar-blur': '18px',
      'ease': 'power3.in',
    }, '>-0.04')
}

function setupMotionPreference() {
  if (typeof window === 'undefined' || !('matchMedia' in window))
    return

  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduceMotion = media.matches

  const update = (event: MediaQueryListEvent) => {
    reduceMotion = event.matches
  }

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', update)
    motionCleanup = () => media.removeEventListener('change', update)
  }
  else {
    media.addListener(update)
    motionCleanup = () => media.removeListener(update)
  }
}

const intersectionHandler: IntersectionObserverCallback = (entries) => {
  const [entry] = entries
  if (!entry)
    return

  if (entry.isIntersecting) {
    clearLeaveTimeout()
    state.value = 'active'
  }
  else if (state.value === 'active') {
    scheduleLeave()
  }
}

function initObserver(target: HTMLElement | null) {
  if (!target || typeof window === 'undefined')
    return

  if (!('IntersectionObserver' in window)) {
    state.value = 'active'
    return
  }

  observer?.disconnect()
  observer = new IntersectionObserver(intersectionHandler, {
    threshold: 0.05,
  })
  observer.observe(target)
}

onMounted(() => {
  initObserver(sentinelRef.value)
  setupMotionPreference()
})

watch(sentinelRef, (el) => {
  if (!el)
    return
  initObserver(el)
})

watch(state, async (value) => {
  if (value === 'idle')
    return

  await nextTick()
  const bar = barRef.value
  if (!bar)
    return

  if (value === 'active')
    playEnter(bar)
  else if (value === 'leaving')
    playExit(bar)
}, { flush: 'post' })

onBeforeUnmount(() => {
  observer?.disconnect()
  clearLeaveTimeout()
  motionCleanup?.()
  killActiveTimeline()
  if (barRef.value)
    gsap.killTweensOf(barRef.value)
})
</script>

<template>
  <div
    ref="sentinelRef"
    aria-hidden="true"
    class="tuff-sticky-anchor"
  />

  <div
    v-if="shouldRender"
    ref="barRef"
    class="TuffStickyBar"
    :class="{
      'is-active': isActive,
      'is-leaving': isLeaving,
    }"
  >
    <span class="TuffStickyBar__inner letter-spacing-1 rounded-full bg-gray px-6 py-4 font-bold dark:bg-[#262626]">
      <slot />
    </span>
  </div>
</template>

<style scoped>
.tuff-sticky-anchor {
  display: block;
  height: 1px;
  margin-top: -1px;
  pointer-events: none;
  opacity: 0;
}

.TuffStickyBar {
  position: fixed;
  left: 50%;
  bottom: 2.5vh;
  display: flex;
  justify-content: center;
  width: min(90vw, 480px);
  transform: translateX(-50%);
  opacity: 0;
  --sticky-bar-blur: 24px;
  filter: blur(var(--sticky-bar-blur));
  pointer-events: none;
  visibility: hidden;
  color: #4bd77d;
  z-index: 40;
}

.TuffStickyBar.is-active {
  pointer-events: auto;
  visibility: visible;
}

.TuffStickyBar.is-leaving {
  pointer-events: none;
  visibility: visible;
}

.TuffStickyBar__inner {
  backdrop-filter: blur(16px);
  box-shadow: 0 22px 60px rgba(5, 12, 32, 0.5);
}
</style>
