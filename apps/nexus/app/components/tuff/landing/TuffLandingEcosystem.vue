<script setup lang="ts">
import { computed, ref } from 'vue'

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

const hovered = ref(false)
const maskPosition = ref({ cx: '50%', cy: '50%' })
const transitionDuration = 600

const strokeStyle = computed(() => ({
  strokeDashoffset: hovered.value ? '0' : '900',
  strokeDasharray: '900',
  transition: 'stroke-dashoffset 4s ease-in-out, stroke-dasharray 4s ease-in-out',
}))

const gradientOpacity = computed(() => (hovered.value ? 0.9 : 0.38))

const clampPercentage = (value: number) => `${Math.min(Math.max(value, 0), 100)}%`

function updateMaskPosition(clientX: number, clientY: number, target: EventTarget | null) {
  if (!(target instanceof HTMLElement))
    return

  const rect = target.getBoundingClientRect()
  const cx = ((clientX - rect.left) / rect.width) * 100
  const cy = ((clientY - rect.top) / rect.height) * 100

  maskPosition.value = {
    cx: clampPercentage(cx),
    cy: clampPercentage(cy),
  }
}

function handleMouseEnter() {
  hovered.value = true
}

function handleMouseLeave() {
  hovered.value = false
}

function handleMouseMove(event: MouseEvent) {
  updateMaskPosition(event.clientX, event.clientY, event.currentTarget)
}

function handleTouchStart(event: TouchEvent) {
  hovered.value = true
  handleTouchMove(event)
}

function handleTouchMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch)
    return
  updateMaskPosition(touch.clientX, touch.clientY, event.currentTarget)
}

function handleTouchEnd() {
  hovered.value = false
}
</script>

<template>
  <TuffLandingSection
    id="developer"
    :sticky="openFoundation.eyebrow"
    :title="openFoundation.headline"
    :subtitle="openFoundation.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full flex flex-col gap-10"
    header-class="py-6 text-white space-y-3"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 36,
        duration: 1,
      },
    }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @mousemove="handleMouseMove"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <template #decoration>
      <div class="open-foundation-grid absolute inset-0" />
      <div class="open-foundation-word-grid absolute inset-0">
        <svg
          viewBox="0 0 1200 360"
          preserveAspectRatio="xMidYMid meet"
          class="open-foundation-word-svg"
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
              <stop offset="0%" stop-color="#fde68a" :stop-opacity="gradientOpacity" />
              <stop offset="25%" stop-color="#fda4af" :stop-opacity="gradientOpacity" />
              <stop offset="50%" stop-color="#93c5fd" :stop-opacity="gradientOpacity" />
              <stop offset="75%" stop-color="#67e8f9" :stop-opacity="gradientOpacity" />
              <stop offset="100%" stop-color="#c4b5fd" :stop-opacity="gradientOpacity" />
            </linearGradient>

            <radialGradient
              :id="`${designWordId}-reveal`"
              gradientUnits="userSpaceOnUse"
              r="55%"
              :cx="maskPosition.cx"
              :cy="maskPosition.cy"
              :style="{
                transition: `cx ${transitionDuration}ms ease-out, cy ${transitionDuration}ms ease-out`,
              }"
            >
              <stop offset="0%" stop-color="white" />
              <stop offset="100%" stop-color="black" />
            </radialGradient>

            <mask :id="`${designWordId}-mask`">
              <rect x="0" y="0" width="100%" height="100%" :fill="`url(#${designWordId}-reveal)`" />
            </mask>
          </defs>

          <text
            x="50%"
            y="50%"
            text-anchor="middle"
            dominant-baseline="middle"
            stroke="rgba(255, 255, 255, 0.35)"
            stroke-width="1.1"
            class="open-foundation-word-text open-foundation-word-base"
          >
            DESIGN
          </text>

          <text
            x="50%"
            y="50%"
            text-anchor="middle"
            dominant-baseline="middle"
            stroke="rgba(255, 255, 255, 0.45)"
            stroke-width="1.1"
            :style="strokeStyle"
            class="open-foundation-word-text open-foundation-word-trace"
          >
            DESIGN
          </text>

          <text
            x="50%"
            y="50%"
            text-anchor="middle"
            dominant-baseline="middle"
            :stroke="`url(#${designWordId}-gradient)`"
            stroke-width="1.1"
            :mask="`url(#${designWordId}-mask)`"
            class="open-foundation-word-text open-foundation-word-glow"
          >
            DESIGN
          </text>
        </svg>
      </div>
      <div class="absolute left-0 top-1/3 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(44,96,200,0.28),_transparent_65%)] blur-3xl -translate-x-1/2" />
      <div class="absolute inset-x-0 top-[-240px] h-[520px] w-[720px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(125,211,252,0.16),_transparent_70%)] blur-3xl mx-auto" />
      <div class="absolute inset-y-0 right-[-240px] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(30,120,110,0.24),_transparent_70%)] blur-3xl" />
    </template>

    <div
      v-if="openFoundation.cta && openFoundation.ctaHref"
      data-reveal
      class="flex justify-center"
    >
      <NuxtLink
        :to="openFoundation.ctaHref"
        class="open-foundation-cta inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-6 py-3 text-sm text-emerald-100 font-semibold shadow-[0_18px_50px_rgba(16,185,129,0.18)] transition hover:border-emerald-200/70 hover:bg-emerald-200/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40"
        :aria-label="openFoundation.cta"
      >
        <span>{{ openFoundation.cta }}</span>
        <span class="i-carbon-arrow-right text-base" aria-hidden="true" />
      </NuxtLink>
    </div>

    <div class="grid mt-12 gap-6 pb-12 lg:grid-cols-3 md:grid-cols-2 z-10">
      <article
        v-for="pillar in openFoundation.pillars"
        :key="pillar.id"
        data-reveal
        class="group relative h-full flex flex-col gap-6 overflow-hidden border border-white/10 rounded-[28px] bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-8 text-left text-white/75 shadow-[0_28px_90px_rgba(3,15,59,0.4)] transition duration-500 hover:border-white/30 hover:bg-[linear-gradient(160deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))]"
      >
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_65%)] opacity-0 transition duration-500 group-hover:opacity-100" />
        <span class="relative h-12 w-12 inline-flex items-center justify-center border border-white/10 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2),_rgba(12,20,43,0.6))] text-white shadow-[0_24px_40px_rgba(0,0,0,0.35)]">
          <span :class="pillar.icon" class="text-xl text-[#9bd7ff]" aria-hidden="true" />
        </span>
        <div class="relative text-white space-y-2">
          <h3 class="text-lg text-white font-semibold">
            {{ pillar.title }}
          </h3>
        </div>
        <p class="relative text-sm text-white/70 leading-relaxed">
          {{ pillar.copy }}
        </p>
      </article>
    </div>

    <p
      data-reveal
      class="text-center text-sm text-white/45"
    >
      {{ openFoundation.footnote }}
    </p>
  </TuffLandingSection>
</template>

<style scoped>
.open-foundation-grid {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 120px 120px;
  mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.9), transparent 72%);
  opacity: 0.35;
}

.open-foundation-word-grid {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(2rem, 10vh, 6rem) clamp(1rem, 8vw, 5rem);
  opacity: 0.35;
  pointer-events: none;
  user-select: none;
  mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.95), transparent 92%);
  z-index: -10;
}

.open-foundation-word-svg {
  width: 100%;
  height: 100%;
  max-height: 70vh;
  mix-blend-mode: screen;
  filter: drop-shadow(0 18px 40px rgba(0, 0, 0, 0.35));
}

.open-foundation-word-text {
  font-size: clamp(170px, 21vw, 300px);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  fill: transparent;
  font-family: 'PingFang SC', 'Segoe UI', 'Helvetica Neue', 'DM Sans', sans-serif;
}

.open-foundation-word-base {
  opacity: 0.85;
}

.open-foundation-word-trace {
  opacity: 0.7;
}

.open-foundation-word-glow {
  opacity: 1;
}

@media (max-width: 900px) {
  .open-foundation-word-text {
    font-size: 160px;
    letter-spacing: 0.16em;
  }
}

@media (max-width: 640px) {
  .open-foundation-word-text {
    font-size: 130px;
    letter-spacing: 0.14em;
  }
}
</style>
