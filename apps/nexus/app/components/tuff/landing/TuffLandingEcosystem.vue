<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TuffLandingSection from './TuffLandingSection.vue'

const { t } = useI18n()

const foundationKeys = ['core', 'sdk', 'community'] as const
const foundationIcons = {
  core: 'i-carbon-certificate-check',
  sdk: 'i-carbon-cube',
  community: 'i-carbon-collaborate',
} as const

const openFoundation = computed(() => ({
  eyebrow: t('landing.os.openFoundation.eyebrow'),
  headline: t('landing.os.openFoundation.headline'),
  subheadline: t('landing.os.openFoundation.subheadline'),
  pillars: foundationKeys.map(key => ({
    id: key,
    icon: foundationIcons[key],
    title: t(`landing.os.openFoundation.pillars.${key}.title`),
    copy: t(`landing.os.openFoundation.pillars.${key}.copy`),
  })),
  footnote: t('landing.os.openFoundation.footnote'),
  cta: t('landing.os.openFoundation.cta'),
  ctaHref: t('landing.os.openFoundation.ctaHref'),
}))

const designWordId = 'open-foundation-design'

/**
 * Interaction model:
 * - `entered` gates the one-shot stroke draw + staggered chip reveal (local
 *   IntersectionObserver; deliberately NOT data-reveal/GSAP — the staggered
 *   gsap.from reveal freezes mid-flight on this page, see plugin snap scroll).
 * - Pointer position feeds three lerped rAF targets: the spotlight mask over
 *   the wordmark, the wordmark parallax, and the magnetic CTA offset.
 */
const rootRef = ref<HTMLElement | null>(null)
const wordSvgRef = ref<SVGSVGElement | null>(null)
const wordLayerRef = ref<HTMLElement | null>(null)
const revealGradientRef = ref<SVGElement | null>(null)
const ctaInnerRef = ref<HTMLElement | null>(null)

const entered = ref(false)
const hovered = ref(false)
const reduceMotion = ref(false)

const targetState = {
  maskX: 50,
  maskY: 50,
  parX: 0,
  parY: 0,
  magX: 0,
  magY: 0,
}
const currentState = { ...targetState }
let rafId = 0
let rafActive = false

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function approach(key: keyof typeof targetState, alpha: number) {
  const delta = targetState[key] - currentState[key]
  if (Math.abs(delta) < 0.03) {
    currentState[key] = targetState[key]
    return false
  }
  currentState[key] += delta * alpha
  return true
}

function step() {
  rafActive = false
  let moving = false
  moving = approach('maskX', 0.16) || moving
  moving = approach('maskY', 0.16) || moving
  moving = approach('parX', 0.1) || moving
  moving = approach('parY', 0.1) || moving
  moving = approach('magX', 0.18) || moving
  moving = approach('magY', 0.18) || moving

  revealGradientRef.value?.setAttribute('cx', `${currentState.maskX}%`)
  revealGradientRef.value?.setAttribute('cy', `${currentState.maskY}%`)

  const wordLayer = wordLayerRef.value
  if (wordLayer)
    wordLayer.style.transform = `translate3d(${currentState.parX * -12}px, ${currentState.parY * -7}px, 0)`

  const ctaInner = ctaInnerRef.value
  if (ctaInner)
    ctaInner.style.transform = `translate3d(${currentState.magX}px, ${currentState.magY}px, 0)`

  if (moving)
    scheduleFrame()
}

function scheduleFrame() {
  if (rafActive)
    return
  rafActive = true
  rafId = requestAnimationFrame(step)
}

function onPointerMove(event: PointerEvent) {
  if (reduceMotion.value)
    return

  const section = event.currentTarget as HTMLElement | null
  const svg = wordSvgRef.value
  if (!section || !svg)
    return

  const sectionRect = section.getBoundingClientRect()
  const wordRect = svg.getBoundingClientRect()

  targetState.maskX = clamp(((event.clientX - wordRect.left) / wordRect.width) * 100, -30, 130)
  targetState.maskY = clamp(((event.clientY - wordRect.top) / wordRect.height) * 100, -60, 160)
  targetState.parX = clamp(((event.clientX - sectionRect.left) / sectionRect.width - 0.5) * 2, -1, 1)
  targetState.parY = clamp(((event.clientY - sectionRect.top) / sectionRect.height - 0.5) * 2, -1, 1)

  const ctaInner = ctaInnerRef.value
  if (ctaInner) {
    const ctaRect = ctaInner.getBoundingClientRect()
    const dx = event.clientX - (ctaRect.left + ctaRect.width / 2 - currentState.magX)
    const dy = event.clientY - (ctaRect.top + ctaRect.height / 2 - currentState.magY)
    const distance = Math.hypot(dx, dy)
    const radius = 150
    if (distance < radius && distance > 0) {
      const pull = (1 - distance / radius) * 10
      targetState.magX = (dx / distance) * pull
      targetState.magY = (dy / distance) * pull
    }
    else {
      targetState.magX = 0
      targetState.magY = 0
    }
  }

  scheduleFrame()
}

function onPointerEnter() {
  hovered.value = true
  // Belt-and-braces: a pointer inside the section means it is on screen even
  // if the IntersectionObserver delivery got delayed by scroll hijacking.
  entered.value = true
}

function onPointerLeave() {
  hovered.value = false
  targetState.maskX = 50
  targetState.maskY = 50
  targetState.parX = 0
  targetState.parY = 0
  targetState.magX = 0
  targetState.magY = 0
  if (!reduceMotion.value)
    scheduleFrame()
}

function onChipPointerMove(event: PointerEvent) {
  const surface = event.currentTarget as HTMLElement | null
  if (!surface)
    return
  const rect = surface.getBoundingClientRect()
  surface.style.setProperty('--chip-x', `${event.clientX - rect.left}px`)
  surface.style.setProperty('--chip-y', `${event.clientY - rect.top}px`)
}

let observer: IntersectionObserver | null = null
let motionMedia: MediaQueryList | null = null
let onMotionChange: ((event: MediaQueryListEvent) => void) | null = null
let onScrollCheck: (() => void) | null = null

function detachRevealFallback() {
  if (onScrollCheck) {
    window.removeEventListener('scroll', onScrollCheck)
    onScrollCheck = null
  }
}

function revealIfVisible() {
  if (entered.value)
    return true
  const root = rootRef.value
  if (!root)
    return false
  const rect = root.getBoundingClientRect()
  if (rect.top < window.innerHeight && rect.bottom > 0) {
    entered.value = true
    return true
  }
  return false
}

onMounted(() => {
  motionMedia = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
  reduceMotion.value = motionMedia?.matches ?? false
  if (motionMedia && typeof motionMedia.addEventListener === 'function') {
    onMotionChange = (event) => {
      reduceMotion.value = event.matches
    }
    motionMedia.addEventListener('change', onMotionChange)
  }

  const root = rootRef.value
  if (!root || reduceMotion.value || typeof IntersectionObserver === 'undefined') {
    entered.value = true
    return
  }

  if (revealIfVisible())
    return

  observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) {
      entered.value = true
      observer?.disconnect()
      observer = null
      detachRevealFallback()
    }
  }, { threshold: [0, 0.25] })
  observer.observe(root)

  // IntersectionObserver delivery can lag behind programmatic scroll jumps on
  // this snap-scrolled page; a geometry check on scroll makes reveal
  // deterministic. Detaches itself after the first hit.
  onScrollCheck = () => {
    if (revealIfVisible()) {
      detachRevealFallback()
      observer?.disconnect()
      observer = null
    }
  }
  window.addEventListener('scroll', onScrollCheck, { passive: true })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  detachRevealFallback()
  if (motionMedia && onMotionChange && typeof motionMedia.removeEventListener === 'function')
    motionMedia.removeEventListener('change', onMotionChange)
  motionMedia = null
  onMotionChange = null
  cancelAnimationFrame(rafId)
  rafActive = false
})
</script>

<template>
  <TuffLandingSection
    id="developer"
    :sticky="openFoundation.eyebrow"
    :title="openFoundation.headline"
    :subtitle="openFoundation.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full flex flex-col gap-4"
    header-class="pt-2 pb-0 text-white space-y-3"
    title-class="text-[clamp(1.7rem,1.4vw+1.1rem,2.35rem)] font-bold leading-[1.15] tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/55"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 36,
        duration: 1,
      },
    }"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @pointermove="onPointerMove"
  >
    <template #decoration>
      <div class="open-foundation-grid absolute inset-0" />
      <div class="absolute left-0 top-1/3 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.18),_transparent_65%)] blur-3xl -translate-x-1/2" />
      <div class="absolute inset-x-0 top-[-240px] h-[520px] w-full max-w-[720px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(34,211,238,0.12),_transparent_70%)] blur-3xl mx-auto" />
      <div class="absolute inset-y-0 right-0 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(139,92,246,0.14),_transparent_70%)] blur-3xl sm:right-[-240px]" />
    </template>

    <div
      ref="rootRef"
      class="of-root"
      :class="{ 'is-in': entered, 'is-hot': hovered, 'is-static': reduceMotion }"
    >
      <div class="of-stage">
        <div class="of-word-bleed">
          <div ref="wordLayerRef" class="of-word-layer">
            <svg
              ref="wordSvgRef"
              viewBox="0 0 1200 300"
              preserveAspectRatio="xMidYMid meet"
              class="of-word-svg"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  :id="`${designWordId}-gradient`"
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2="1200"
                  y2="0"
                >
                  <stop offset="0%" stop-color="#fde68a" />
                  <stop offset="25%" stop-color="#fda4af" />
                  <stop offset="50%" stop-color="#93c5fd" />
                  <stop offset="75%" stop-color="#67e8f9" />
                  <stop offset="100%" stop-color="#c4b5fd" />
                  <animateTransform
                    v-if="!reduceMotion"
                    attributeName="gradientTransform"
                    type="translate"
                    values="0 0; 150 0; 0 0"
                    dur="14s"
                    repeatCount="indefinite"
                  />
                </linearGradient>

                <radialGradient
                  :id="`${designWordId}-reveal`"
                  ref="revealGradientRef"
                  gradientUnits="userSpaceOnUse"
                  r="55%"
                  cx="50%"
                  cy="50%"
                >
                  <stop offset="0%" stop-color="white" />
                  <stop offset="100%" stop-color="black" />
                </radialGradient>

                <mask :id="`${designWordId}-mask`">
                  <rect x="0" y="0" width="1200" height="300" :fill="`url(#${designWordId}-reveal)`" />
                </mask>
              </defs>

              <text x="600" y="156" text-anchor="middle" dominant-baseline="central" class="of-word of-word-base">
                DESIGN
              </text>

              <text x="600" y="156" text-anchor="middle" dominant-baseline="central" class="of-word of-word-trace">
                DESIGN
              </text>

              <text
                x="600"
                y="156"
                text-anchor="middle"
                dominant-baseline="central"
                :stroke="`url(#${designWordId}-gradient)`"
                :mask="`url(#${designWordId}-mask)`"
                class="of-word of-word-glow"
              >
                DESIGN
              </text>
            </svg>
          </div>
        </div>

        <div
          v-if="openFoundation.cta && openFoundation.ctaHref"
          class="of-cta-slot"
        >
          <NuxtLink
            :to="openFoundation.ctaHref"
            class="of-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40"
            :aria-label="openFoundation.cta"
          >
            <span ref="ctaInnerRef" class="of-cta-inner">
              <span>{{ openFoundation.cta }}</span>
              <span class="i-carbon-arrow-right of-cta-arrow" aria-hidden="true" />
            </span>
          </NuxtLink>
        </div>
      </div>

      <ul class="of-pillars">
        <li
          v-for="(pillar, index) in openFoundation.pillars"
          :key="pillar.id"
          class="of-chip"
          :style="{ '--chip-delay': `${180 + index * 110}ms` }"
        >
          <div class="of-chip-surface" @pointermove="onChipPointerMove">
            <span class="of-chip-icon">
              <span :class="pillar.icon" aria-hidden="true" />
            </span>
            <span class="of-chip-body">
              <span class="of-chip-title">{{ pillar.title }}</span>
              <span class="of-chip-copy">{{ pillar.copy }}</span>
            </span>
          </div>
        </li>
      </ul>

      <p class="of-footnote">
        {{ openFoundation.footnote }}
      </p>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.open-foundation-grid {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 120px 120px;
  mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.9), transparent 72%);
  opacity: 0.5;
}

.of-root {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* --- wordmark stage --- */

.of-stage {
  position: relative;
  margin-top: 4px;
}

/* Full-bleed breakout so the wordmark spans the viewport like the original,
   with a deliberate slight crop of D/N at the screen edges. */
.of-word-bleed {
  position: relative;
  left: 50%;
  width: 100vw;
  transform: translateX(-50%);
}

.of-word-layer {
  pointer-events: none;
  user-select: none;
  will-change: transform;
}

.of-word-svg {
  display: block;
  width: 100%;
  height: clamp(300px, 44vh, 460px);
  mix-blend-mode: screen;
  filter: drop-shadow(0 18px 40px rgba(0, 0, 0, 0.35));
}

.of-word {
  font-family: 'Poppins', 'Avenir Next', 'DM Sans', 'Segoe UI', sans-serif;
  font-size: 275px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  fill: transparent;
}

.of-word-base {
  stroke: rgba(255, 255, 255, 0.28);
  stroke-width: 1.1;
}

/* Original hover effect: the stroke slides along the letters while hovering,
   and slides back out on leave. */
.of-word-trace {
  stroke: rgba(255, 255, 255, 0.45);
  stroke-width: 1.2;
  stroke-dasharray: 1600;
  stroke-dashoffset: 1600;
  transition: stroke-dashoffset 4s ease-in-out;
}

.is-hot .of-word-trace {
  stroke-dashoffset: 0;
}

.of-word-glow {
  stroke-width: 1.4;
  opacity: 0.55;
  transition: opacity 0.6s ease;
}

.is-hot .of-word-glow {
  opacity: 1;
}

/* --- CTA docked at the wordmark baseline --- */

.of-cta-slot {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
}

.of-cta {
  display: inline-flex;
  text-decoration: none;
}

.of-cta-inner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 26px;
  border-radius: 9999px;
  border: 1px solid rgba(110, 231, 183, 0.4);
  background: rgba(6, 18, 14, 0.72);
  backdrop-filter: blur(10px);
  color: rgb(209, 250, 229);
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 18px 50px rgba(16, 185, 129, 0.18);
  transition: border-color 0.3s ease, background-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease;
  will-change: transform;
}

.of-cta:hover .of-cta-inner {
  border-color: rgba(167, 243, 208, 0.7);
  background: rgba(13, 38, 30, 0.82);
  color: #fff;
  box-shadow: 0 18px 60px rgba(16, 185, 129, 0.3);
}

.of-cta-arrow {
  font-size: 16px;
  transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.of-cta:hover .of-cta-arrow {
  transform: translateX(4px);
}

/* --- pillar chips --- */

.of-pillars {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 34px 0 0;
  padding: 0;
  list-style: none;
}

.of-chip {
  opacity: 0;
  transform: translateY(18px);
}

.is-in .of-chip {
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 0.7s ease var(--chip-delay, 0ms),
    transform 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) var(--chip-delay, 0ms);
}

.of-chip-surface {
  --chip-x: 50%;
  --chip-y: 50%;
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 100%;
  min-height: 78px;
  padding: 14px 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015));
  backdrop-filter: blur(8px);
  transition: border-color 0.35s ease, background 0.35s ease;
}

.of-chip-surface::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: radial-gradient(150px circle at var(--chip-x) var(--chip-y), rgba(52, 211, 153, 0.6), rgba(34, 211, 238, 0.22) 45%, transparent 72%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.35s ease;
  pointer-events: none;
}

.of-chip-surface:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
}

.of-chip-surface:hover::after {
  opacity: 1;
}

.of-chip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: radial-gradient(circle at top, rgba(52, 211, 153, 0.18), rgba(10, 20, 26, 0.7));
  color: #86efac;
  font-size: 18px;
}

.of-chip-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.of-chip-title {
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.of-chip-copy {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* --- footnote --- */

.of-footnote {
  margin: 18px 0 0;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  opacity: 0;
  transform: translateY(12px);
}

.is-in .of-footnote {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 0.7s ease 520ms, transform 0.7s ease 520ms;
}

/* --- responsive --- */

@media (max-width: 767px) {
  .of-pillars {
    grid-template-columns: 1fr;
    gap: 10px;
    margin-top: 26px;
  }

  .of-word-svg {
    height: clamp(150px, 27vh, 230px);
  }

  .of-cta-slot {
    position: static;
    display: flex;
    justify-content: center;
    transform: none;
    margin-top: 14px;
  }
}

/* --- reduced motion: everything rests in its final state --- */

@media (prefers-reduced-motion: reduce) {
  .of-word-trace {
    stroke-dashoffset: 0;
    transition: none;
  }

  .of-word-glow {
    opacity: 0.75;
    transition: none;
  }

  .of-chip,
  .of-footnote {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .of-cta-arrow,
  .of-chip-surface,
  .of-word-layer,
  .of-cta-inner {
    transition: none;
    transform: none !important;
  }
}

.is-static .of-word-trace {
  stroke-dashoffset: 0;
  transition: none;
}

.is-static .of-chip,
.is-static .of-footnote {
  opacity: 1;
  transform: none;
  transition: none;
}
</style>
