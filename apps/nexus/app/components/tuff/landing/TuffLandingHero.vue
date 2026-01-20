<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useLandingRevealState } from '~/composables/useLandingRevealState'
import TuffBanner from '../TuffBanner.vue'

type GsapContext = gsap.Context
type GsapTween = gsap.core.Tween

interface HeroCta {
  label?: string
  to?: string
  icon?: string
}

interface HeroConfig {
  title?: string
  description?: string
  bullets?: string[]
  primaryCta?: HeroCta
  secondaryCta?: HeroCta
}

const props = defineProps<{
  hero?: HeroConfig
}>()

const { t } = useI18n()
const heroSectionRef = ref<HTMLElement | null>(null)

const {
  beginSequence,
  resetSequence,
  sequenceStarted,
  contentVisible,
  interactiveReady,
} = useLandingRevealState()

const heroContainerClass = computed(() => ({
  'hero-landing-container': sequenceStarted.value,
  'is-active': contentVisible.value,
}))

const heroStageClass = computed(() => ({
  'hero-landing-stage': true,
  'is-visible': contentVisible.value,
}))

const heroCtaClass = computed(() => ({
  'hero-landing-stage': true,
  'is-visible': contentVisible.value,
  'is-interactive': interactiveReady.value,
}))

const heroBulletFallbackKeys = ['cinematic', 'policy', 'realtime'] as const

const heroContent = computed(() => {
  const hero = props.hero ?? {}
  const primary = hero.primaryCta ?? {}
  const secondary = hero.secondaryCta ?? {}
  const bullets
    = hero.bullets && hero.bullets.length > 0
      ? hero.bullets
      : heroBulletFallbackKeys.map(key => t(`landing.hero.bullets.${key}`))

  return {
    title: hero.title ?? t('landing.hero.heading'),
    description: hero.description ?? t('landing.hero.description'),
    bullets,
    primaryCta: {
      to: primary.to ?? '#download',
      label: primary.label ?? t('landing.hero.primaryCta'),
      icon: primary.icon ?? 'i-carbon-play-filled',
    },
    secondaryCta: {
      to: secondary.to ?? '/docs',
      label: secondary.label ?? t('landing.hero.secondaryCta'),
      icon: secondary.icon ?? 'i-carbon-book',
    },
  }
})

function introDelay(delayInSeconds: number) {
  return {
    '--intro-delay': `${delayInSeconds}s`,
  }
}

onMounted(async () => {
  beginSequence()

  // if (typeof window === 'undefined')
  //   return

  // const heroEl = heroSectionRef.value
  // if (!heroEl)
  //   return

  // const statsSection = document.querySelector<HTMLElement>('#landing-stats')
  // if (!statsSection)
  //   return

  // const [{ gsap }, { ScrollTrigger }, { ScrollToPlugin }] = await Promise.all([
  //   import('gsap'),
  //   import('gsap/ScrollTrigger'),
  //   import('gsap/ScrollToPlugin'),
  // ])

  // if (!heroScrollPluginsRegistered) {
  //   gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)
  //   heroScrollPluginsRegistered = true
  // }

  // autoScrollTriggered = false
  // autoScrollTween?.kill()
  // autoScrollTween = null

  // heroScrollContext = gsap.context(() => {
  //   ScrollTrigger.create({
  //     trigger: heroEl,
  //     start: 'top top',
  //     end: '+=260',
  //     onLeave: (self) => {
  //       if (autoScrollTriggered)
  //         return

  //       autoScrollTriggered = true

  //       const trigger = self
  //       autoScrollTween?.kill()

  //       const releaseTrigger = () => {
  //         autoScrollTween = null
  //         trigger.kill()
  //       }

  //       autoScrollTween = gsap.to(window, {
  //         scrollTo: {
  //           y: statsSection,
  //           offsetY: -60,
  //         },
  //         duration: 1.35,
  //         ease: 'power3.out',
  //         autoKill: false,
  //         overwrite: 'auto',
  //         onComplete: releaseTrigger,
  //         onInterrupt: releaseTrigger,
  //       })
  //     },
  //   })
  // }, heroEl)
})

onBeforeUnmount(() => {
  // heroScrollContext?.revert()
  // heroScrollContext = undefined
  // autoScrollTween?.kill()
  // autoScrollTween = null
  // autoScrollTriggered = false
  resetSequence({ preserveHeader: true })
})
</script>

<template>
  <section
    ref="heroSectionRef"
    class="TuffHome-HeroSection relative min-h-screen overflow-hidden"
  >
    <div class="TuffHome-HeroSection-BannerCore absolute left-0 top-0 h-full w-full">
      <TuffBanner>
        <template #center>
          <div
            class="hero-content min-h-screen w-full flex flex-col items-center justify-center gap-8 px-8 py-20 text-center text-white/85"
            :class="heroContainerClass"
          >
            <div
              class="hero-wordmark"
              :class="heroStageClass"
              :style="introDelay(0)"
              aria-hidden="true"
            >
              <span class="hero-wordmark-text" data-text="Tuff">Tuff</span>
            </div>

            <h1
              class="hero-heading max-w-3xl text-[clamp(1rem,1vw+1.5rem,1rem)] text-white font-semibold leading-tight"
              :class="heroStageClass"
              :style="introDelay(0.2)"
            >
              {{ heroContent.title }}
            </h1>

            <!-- <p
              v-if="heroContent.description"
              class="hero-description max-w-3xl text-white/80"
              :class="heroStageClass"
              :style="introDelay(0.28)"
            >
              {{ heroContent.description }}
            </p> -->

            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
              <NuxtLink
                :to="heroContent.primaryCta.to"
                class="hero-cta inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm text-black font-semibold shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 hover:-translate-y-0.5"
                :class="heroCtaClass"
                :style="introDelay(0.36)"
                :aria-label="heroContent.primaryCta.label"
              >
                <span
                  v-if="heroContent.primaryCta.icon"
                  :class="heroContent.primaryCta.icon"
                  class="text-base"
                  aria-hidden="true"
                />
                <span>{{ heroContent.primaryCta.label }}</span>
              </NuxtLink>

              <NuxtLink
                :to="heroContent.secondaryCta.to"
                class="hero-cta inline-flex items-center justify-center gap-2 border border-white/20 rounded-full px-6 py-3 text-sm text-white font-semibold transition hover:border-white/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 hover:-translate-y-0.5"
                :class="heroCtaClass"
                :style="introDelay(0.48)"
                :aria-label="heroContent.secondaryCta.label"
              >
                <span
                  v-if="heroContent.secondaryCta.icon"
                  :class="heroContent.secondaryCta.icon"
                  class="text-base"
                  aria-hidden="true"
                />
                <span>{{ heroContent.secondaryCta.label }}</span>
              </NuxtLink>
            </div>
          </div>
        </template>
      </TuffBanner>
    </div>
  </section>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&display=swap');

.hero-wordmark {
  position: relative;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.hero-wordmark-text {
  position: relative;
  display: inline-block;
  font-family: 'Poppins', sans-serif;
  font-size: clamp(4rem, 12vw, 9rem);
  font-weight: 700;
  letter-spacing: clamp(1rem, 1.6vw, 2.5rem);
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.45);
  color: rgba(255, 255, 255, 0.92);
  text-shadow:
    0 0 10px rgba(255, 255, 255, 0.28),
    0 0 25px rgba(255, 255, 255, 0.18),
    0 0 45px rgba(255, 255, 255, 0.12);
}

.hero-wordmark-text::before {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  z-index: -1;
  transform: scale(1, 1.4);
  filter: blur(18px) brightness(210%);
  background: linear-gradient(45deg, #021a73, #330501);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

@media (max-width: 640px) {
  .hero-wordmark-text {
    letter-spacing: clamp(0.5rem, 3vw, 1rem);
  }
}

.hero-landing-container {
  opacity: 0;
  filter: blur(32px);
  transform: translate3d(0, 48px, 0);
  transition:
    opacity 1.2s cubic-bezier(0.22, 0.61, 0.36, 1),
    filter 1.4s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 1.2s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.hero-landing-container.is-active {
  opacity: 1;
  filter: blur(0);
  transform: translate3d(0, 0, 0);
}

.hero-landing-stage {
  opacity: 0;
  filter: blur(28px);
  transform: translate3d(0, 28px, 0);
  transition:
    opacity 1s cubic-bezier(0.22, 0.61, 0.36, 1),
    filter 1.3s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 1.05s cubic-bezier(0.22, 0.61, 0.36, 1);
  transition-delay: var(--intro-delay, 0s);
}

.hero-landing-stage.is-visible {
  opacity: 1;
  filter: blur(0);
  transform: translate3d(0, 0, 0);
}

.hero-description {
  margin: 0;
  font-size: clamp(0.85rem, 0.6vw + 0.95rem, 1.2rem);
  font-weight: 500;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.78);
}

.hero-bullets {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.75rem;
  max-width: 46rem;
}

.hero-bullet-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 0.95rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.78);
}

.hero-bullet-dot {
  margin-top: 0.4rem;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 9999px;
  background: rgba(190, 242, 100, 1);
  box-shadow: 0 0 12px rgba(190, 242, 100, 0.6);
  flex-shrink: 0;
}

.hero-cta {
  pointer-events: none;
}

.hero-cta.is-interactive {
  pointer-events: auto;
}
</style>
