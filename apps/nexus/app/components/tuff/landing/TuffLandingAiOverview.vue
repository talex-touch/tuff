<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '~/components/icon/Icon.vue'

const { t } = useI18n()

const aiOverviewBulletKeys = ['understand', 'instant', 'privacy'] as const
const aiOverviewHighlightKeys = ['orchestrate', 'copilot', 'memory'] as const
const aiOverviewHighlightIcons = {
  orchestrate: 'i-carbon-flow-modeler',
  copilot: 'i-carbon-machine-learning-model',
  memory: 'i-carbon-reminder',
} as const

const aiOverview = computed(() => ({
  eyebrow: t('landing.os.aiOverview.eyebrow'),
  headline: t('landing.os.aiOverview.headline'),
  subheadline: t('landing.os.aiOverview.subheadline'),
  hero: {
    title: t('landing.os.aiOverview.hero.title'),
    copy: t('landing.os.aiOverview.hero.copy'),
    primaryCta: t('landing.os.aiOverview.hero.primaryCta'),
    secondaryCta: t('landing.os.aiOverview.hero.secondaryCta'),
    bullets: aiOverviewBulletKeys.map(key => t(`landing.os.aiOverview.hero.bullets.${key}`)),
  },
  highlights: aiOverviewHighlightKeys.map(key => ({
    icon: aiOverviewHighlightIcons[key],
    title: t(`landing.os.aiOverview.highlights.${key}.title`),
    copy: t(`landing.os.aiOverview.highlights.${key}.copy`),
  })),
}))

const hero = computed(() => aiOverview.value.hero)
const highlights = computed(() => aiOverview.value.highlights ?? [])
const carouselSlides = computed(() => {
  if (highlights.value.length > 0) {
    return highlights.value.map((highlight, index) => ({
      id: highlight.title ?? `highlight-${index}`,
    }))
  }
  return Array.from({ length: 3 }, (_, index) => ({
    id: `placeholder-${index}`,
  }))
})
const activeSlide = ref(0)

watch(
  carouselSlides,
  (slides) => {
    if (!slides.length) {
      activeSlide.value = 0
      return
    }

    if (activeSlide.value >= slides.length) {
      activeSlide.value = 0
    }
  },
  { immediate: true },
)

function goToPrev() {
  const total = carouselSlides.value.length
  if (!total)
    return
  activeSlide.value = (activeSlide.value - 1 + total) % total
}

function goToNext() {
  const total = carouselSlides.value.length
  if (!total)
    return
  activeSlide.value = (activeSlide.value + 1) % total
}

function goToSlide(index: number) {
  const total = carouselSlides.value.length
  if (!total)
    return
  activeSlide.value = Math.max(0, Math.min(index, total - 1))
}
</script>

<template>
  <TuffLandingSection
    :sticky="aiOverview.eyebrow"
    :title="aiOverview.headline"
    :subtitle="aiOverview.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full space-y-12"
    title-class="text-[clamp(.7rem,1vw+1.4rem,1.2rem)] font-bold leading-tight"
    subtitle-class="mx-auto my-0 max-w-3xl text-[clamp(.6rem,1vw+1.3rem,1.1rem)] font-semibold leading-relaxed op-70"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 36,
        duration: 1.1,
      },
    }"
  >
    <template #decoration>
      <div class="absolute left-[-320px] top-1/4 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(244,114,182,0.22),_transparent_68%)] blur-[180px]" />
      <div class="absolute right-[-220px] top-1/2 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.24),_transparent_72%)] blur-[200px] -translate-y-1/2" />
      <div class="absolute inset-x-0 bottom-[-260px] h-[520px] bg-[radial-gradient(circle_at_center,_rgba(14,197,206,0.14),_transparent_70%)] blur-[180px]" />
    </template>

    <div
      class="relative overflow-hidden border border-white/10 rounded-[12px] bg-white/5 p-2 shadow-[0_48px_140px_rgba(5,8,28,0.62)] backdrop-blur-xl"
      data-reveal
    >
      <div class="relative mx-auto w-full">
        <div class="pointer-events-none absolute right-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,_rgba(244,114,182,0.35),transparent_70%)] blur-3xl -top-16" />
        <div class="pointer-events-none absolute left-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.3),transparent_70%)] blur-[120px] -bottom-14" />

        <div class="relative overflow-hidden border border-white/10 rounded-[10px] bg-[linear-gradient(160deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.05)_100%)] p-8 shadow-[0_40px_120px_rgba(8,10,35,0.6)] backdrop-blur-3xl">
          <div class="pointer-events-none absolute inset-x-8 bottom-0 h-[1px] from-transparent via-white/30 to-transparent bg-gradient-to-r opacity-60" />
          <div class="relative space-y-6">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="size-2.5 inline-flex rounded-full bg-[#f87171]" />
                <span class="size-2.5 inline-flex rounded-full bg-[#facc15]" />
                <span class="size-2.5 inline-flex rounded-full bg-[#34d399]" />
              </div>
            </div>

            <div class="relative min-h-[50vh] overflow-hidden border border-white/10 bg-black/40 p-4 backdrop-blur-2xl">
              <div
                class="h-full flex transition-transform duration-500 ease-out"
                :style="{ transform: `translateX(-${activeSlide * 100}%)` }"
              >
                <div
                  v-for="(slide, index) in carouselSlides"
                  :key="slide.id"
                  class="h-full w-full flex-shrink-0 px-2"
                >
                  <div class="min-h-[50vh] w-full rounded-[24px] bg-[linear-gradient(135deg,rgba(244,114,182,0.2),rgba(59,130,246,0.25),rgba(14,165,233,0.18))] shadow-[0_32px_80px_rgba(12,16,40,0.5)] backdrop-blur-xl" />
                </div>
              </div>
            </div>

            <div class="flex flex-col items-center gap-5 pt-2">
              <div class="flex items-center gap-2">
                <button
                  v-for="(slide, index) in carouselSlides"
                  :key="`dot-${slide.id}`"
                  type="button"
                  class="h-2 w-8 rounded-full transition"
                  :class="index === activeSlide ? 'bg-white' : 'bg-white/20 hover:bg-white/30'"
                  @click="goToSlide(index)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="false" class="relative grid w-full items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.25fr)]">
        <article v-if="false" class="text-left space-y-8">
          <!-- <div class="space-y-5">
            <h3 class="my-0 text-[clamp(1.8rem,1vw+2.1rem,2.8rem)] font-semibold leading-tight">
              {{ hero.title }}
            </h3>
            <p class="m-0 max-w-xl text-base text-white/70 leading-relaxed">
              {{ hero.copy }}
            </p>
          </div> -->

          <!-- <ul class="text-sm text-white/70 leading-relaxed space-y-4">
            <li
              v-for="(bullet, index) in hero.bullets"
              :key="index"
              class="flex items-start gap-3"
            >
              <span class="mt-1 size-2.5 inline-flex flex-shrink-0 rounded-full bg-[#f472b6] shadow-[0_0_14px_rgba(244,114,182,0.75)]" />
              <span>{{ bullet }}</span>
            </li>
          </ul> -->

          <div class="flex flex-wrap items-center gap-4">
          <!-- <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm text-neutral-900 font-semibold tracking-[0.16em] uppercase transition hover:bg-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 hover:-translate-y-0.5"
            >
              {{ hero.primaryCta }}
            </button>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 border border-white/20 rounded-full px-7 py-3 text-sm text-white font-semibold tracking-[0.16em] uppercase transition hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 hover:-translate-y-0.5"
            >
              {{ hero.secondaryCta }}
            </button>
          </div> -->
          </div>
        </article>
      </div>
    </div>
  </TuffLandingSection>
</template>
