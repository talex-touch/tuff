<script setup lang="ts">
import { computed } from 'vue'
import TuffLandingAuroraBar from './TuffLandingAuroraBar.vue'
import TuffLandingSection from './TuffLandingSection.vue'

const { t } = useI18n()
const router = useRouter()

const pioneerBenefitKeys = ['early', 'shape', 'community'] as const
const pioneerBenefitMeta = {
  early: { icon: 'i-carbon-play-filled', accent: '#a78bfa' },
  shape: { icon: 'i-carbon-flash-filled', accent: '#7dd3fc' },
  community: { icon: 'i-carbon-user-multiple', accent: '#6ee7b7' },
} as const

const signInRoute = computed(() => ({
  path: '/sign-in',
  query: {
    redirect_url: '/updates?channel=beta',
  },
}))

const pioneer = computed(() => ({
  eyebrow: t('landing.os.pioneer.eyebrow'),
  headline: t('landing.os.pioneer.headline'),
  subheadline: t('landing.os.pioneer.subheadline'),
  ctaPrimary: t('landing.os.pioneer.ctaPrimary'),
  guidance: t('landing.os.pioneer.guidance'),
  benefits: pioneerBenefitKeys.map(key => ({
    key,
    icon: pioneerBenefitMeta[key].icon,
    accent: pioneerBenefitMeta[key].accent,
    title: t(`landing.os.pioneer.benefits.${key}.title`),
    copy: t(`landing.os.pioneer.benefits.${key}.copy`),
  })),
}))

/**
 * Split the headline on sentence boundaries so the closing sentence can carry
 * the gradient accent while the lead stays plain — works for both zh (。) and
 * en (.) copy without locale-specific keys.
 */
const headlineParts = computed(() =>
  pioneer.value.headline
    .split(/(?<=[。．.！!？?])\s*/)
    .filter(part => part.length > 0),
)
const headlineLead = computed(() => headlineParts.value.slice(0, -1))
const headlineAccent = computed(() => headlineParts.value[headlineParts.value.length - 1] ?? '')

const auroraBarCount = 28
const auroraBars = Array.from({ length: auroraBarCount }, (_, i) => {
  const seed = i + 1

  return {
    id: i,
    x: `${((seed * 37) % 101).toFixed(2)}%`,
    width: `${(0.5 + ((seed * 17) % 30) / 10).toFixed(2)}%`,
    delay: Number((((seed * 23) % 80) / 10).toFixed(2)),
    duration: Number((4 + ((seed * 19) % 60) / 10).toFixed(2)),
    // Constrain hues to the blue → violet band so the backdrop reads as one
    // aurora instead of confetti.
    hue: 210 + ((seed * 47) % 110),
    aspectRatio: (seed * 7) % 10 + 1,
  }
})

function goToSignIn() {
  router.push(signInRoute.value)
}
</script>

<template>
  <TuffLandingSection
    id="download"
    section-class="h-full min-h-0 flex flex-col justify-center"
    container-class="max-w-6xl w-full"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 42,
        duration: 1,
      },
      stagger: 0.1,
    }"
  >
    <template #decoration>
      <!-- Aurora bars background -->
      <div class="pioneer-aurora pointer-events-none absolute inset-0 overflow-hidden opacity-45">
        <TuffLandingAuroraBar
          v-for="bar in auroraBars"
          :key="bar.id"
          :x="bar.x"
          :width="bar.width"
          :delay="bar.delay"
          :duration="bar.duration"
          :hue="bar.hue"
          :aspect-ratio="bar.aspectRatio"
        />
      </div>
      <!-- Blur overlay to soften aurora -->
      <div class="pointer-events-none absolute inset-0 backdrop-blur-[64px]" />
      <!-- Horizon glow -->
      <div class="pointer-events-none absolute inset-x-0 bottom-[-14%] h-[52%] bg-[radial-gradient(ellipse_72%_92%_at_50%_100%,rgba(139,92,246,0.16),transparent_68%)]" />
      <!-- Glow orbs -->
      <div class="absolute left-[-220px] top-[30%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(147,51,234,0.14),_transparent_70%)] blur-3xl" />
      <div class="absolute bottom-[10%] right-0 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.12),_transparent_70%)] blur-3xl sm:right-[-200px]" />
    </template>

    <!-- Two-column layout -->
    <div class="waitlist-grid grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
      <!-- Left: eyebrow + headline + CTA -->
      <div class="flex flex-col items-start gap-6">
        <span data-reveal class="pioneer-eyebrow">
          <span class="pioneer-eyebrow-dot" aria-hidden="true" />
          {{ pioneer.eyebrow }}
        </span>

        <h2
          data-reveal
          class="my-0 text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[1.12] tracking-tight [text-wrap:balance]"
        >
          <span
            v-for="(part, index) in headlineLead"
            :key="index"
            class="block text-white/95"
          >{{ part }}</span>
          <span class="pioneer-headline block">{{ headlineAccent }}</span>
        </h2>

        <p data-reveal class="my-0 max-w-md text-base text-white/55 leading-relaxed">
          {{ pioneer.subheadline }}
        </p>

        <div data-reveal class="mt-2 flex flex-col items-start gap-4">
          <button
            type="button"
            class="pioneer-cta group"
            @click="goToSignIn"
          >
            <span>{{ pioneer.ctaPrimary }}</span>
            <span
              class="i-carbon-arrow-right text-base transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </button>

          <p class="my-0 flex max-w-sm items-start gap-2 text-[13px] text-white/38 leading-relaxed">
            <span
              class="i-carbon-information mt-0.5 flex-shrink-0 text-sm text-white/30"
              aria-hidden="true"
            />
            {{ pioneer.guidance }}
          </p>
        </div>
      </div>

      <!-- Right: benefit cards -->
      <div class="flex flex-col gap-3 sm:gap-4">
        <article
          v-for="(benefit, index) in pioneer.benefits"
          :key="benefit.key"
          data-reveal
          class="pioneer-card"
          :style="{ '--accent': benefit.accent }"
        >
          <span class="pioneer-card-icon">
            <span :class="benefit.icon" class="text-lg" aria-hidden="true" />
          </span>
          <div class="min-w-0 flex-1">
            <h3 class="my-0 text-[15px] font-medium text-white/90">
              {{ benefit.title }}
            </h3>
            <p class="mb-0 mt-1 text-sm text-white/45 leading-relaxed">
              {{ benefit.copy }}
            </p>
          </div>
          <span class="pioneer-card-index font-mono" aria-hidden="true">0{{ index + 1 }}</span>
        </article>
      </div>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.pioneer-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  padding: 0.32rem 0.85rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.65);
}

.pioneer-eyebrow-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a78bfa;
  box-shadow: 0 0 10px rgba(167, 139, 250, 0.9);
  animation: pioneer-pulse 2.4s ease-in-out infinite;
}

@keyframes pioneer-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.8);
  }
}

.pioneer-headline {
  background: linear-gradient(
    135deg,
    #fff 0%,
    #e0c3fc 40%,
    #8ec5fc 60%,
    #fff 100%
  );
  background-size: 200% 200%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: pioneer-gradient-shift 6s ease-in-out infinite;
}

@keyframes pioneer-gradient-shift {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

/* Mirrors the hero's solid primary pill so the page opens and closes on the
   same affordance. */
.pioneer-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-height: 3rem;
  padding: 0.78rem 1.6rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(246, 247, 244, 0.96);
  color: #0b0d16;
  font-size: 0.96rem;
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 12px 40px rgba(167, 139, 250, 0.18);
  transition:
    background-color 180ms ease,
    transform 180ms ease,
    box-shadow 180ms ease;
}

.pioneer-cta:hover {
  background: #fff;
  transform: translateY(-1px);
  box-shadow: 0 16px 50px rgba(167, 139, 250, 0.28);
}

.pioneer-cta:active {
  transform: translateY(0);
}

.pioneer-cta:focus-visible {
  outline: 2px solid rgba(167, 139, 250, 0.8);
  outline-offset: 3px;
}

.pioneer-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.025);
  backdrop-filter: blur(10px);
  padding: 1.15rem 1.35rem;
  transition:
    border-color 0.35s ease,
    background-color 0.35s ease,
    transform 0.35s ease,
    box-shadow 0.35s ease;
}

.pioneer-card:hover {
  border-color: color-mix(in srgb, var(--accent) 38%, transparent);
  background: rgba(255, 255, 255, 0.045);
  transform: translateX(4px);
  box-shadow: 0 18px 48px -24px color-mix(in srgb, var(--accent) 45%, transparent);
}

.pioneer-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  margin-top: 2px;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: color-mix(in srgb, var(--accent) 85%, white);
  transition: background-color 0.35s ease, border-color 0.35s ease;
}

.pioneer-card:hover .pioneer-card-icon {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}

.pioneer-card-index {
  margin-left: auto;
  align-self: center;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.18);
  transition: color 0.35s ease;
}

.pioneer-card:hover .pioneer-card-index {
  color: color-mix(in srgb, var(--accent) 65%, transparent);
}

.pioneer-aurora {
  container-type: size;
}

/* CJK copy should break at punctuation, not mid-word; `anywhere` keeps long
   unbroken runs from overflowing as an escape hatch. */
.waitlist-grid {
  word-break: keep-all;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .pioneer-cta {
    width: 100%;
  }
}

@media (max-height: 820px) {
  .waitlist-grid {
    gap: 1.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
