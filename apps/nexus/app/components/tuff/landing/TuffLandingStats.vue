<script setup lang="ts">
import { computed } from 'vue'
import TuffVortexBackground from '../VortexBackground.vue'
import TuffShowcaseContainer from './showcase/TuffShowcaseContainer.vue'
import TuffShowcase from './showcase/TuffShowcase.vue'

const { t } = useI18n()

const aiResultKeys = ['figma', 'files', 'gmail', 'slack'] as const
const aiResultIcons = {
  figma: 'i-carbon-logo-figma',
  files: 'i-carbon-document',
  gmail: 'i-carbon-email',
  slack: 'i-carbon-logo-slack',
} as const

const aiHighlightKeys = ['context', 'silo', 'breathe'] as const

const aiSpotlight = computed(() => ({
  eyebrow: t('landing.os.aiSpotlight.eyebrow'),
  headline: t('landing.os.aiSpotlight.headline'),
  subheadline: t('landing.os.aiSpotlight.subheadline'),
  demo: {
    summary: t('landing.os.aiSpotlight.summary'),
    queryLabel: t('landing.os.aiSpotlight.queryLabel'),
    queryText: t('landing.os.aiSpotlight.queryText'),
    results: aiResultKeys.map(key => ({
      icon: aiResultIcons[key],
      title: t(`landing.os.aiSpotlight.results.${key}.title`),
      meta: t(`landing.os.aiSpotlight.results.${key}.meta`),
    })),
  },
  highlights: aiHighlightKeys.map(key => ({
    title: t(`landing.os.aiSpotlight.highlights.${key}.title`),
    copy: t(`landing.os.aiSpotlight.highlights.${key}.copy`),
  })),
}))
</script>

<template>
  <TuffLandingSection
    id="landing-stats"
    :sticky="aiSpotlight.eyebrow"
    :title="aiSpotlight.headline"
    :subtitle="aiSpotlight.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full flex flex-col gap-8"
    title-class="text-[clamp(.7rem,1vw+1.4rem,1.2rem)] font-bold leading-tight"
    subtitle-class="mx-auto my-0 max-w-3xl text-[clamp(.6rem,1vw+1.3rem,1.1rem)] font-semibold leading-relaxed op-70"
    :reveal-options="{
      targetSelector: ':scope [data-reveal]',
      from: {
        opacity: 0,
        y: 48,
        scale: 1.08,
        filter: 'blur(0px)',
        duration: 1.05,
        ease: 'power3.out',
      },
      stagger: 0.16,
    }"
  >
    <p data-reveal class="mx-auto my-0 max-w-3xl text-sm text-neutral-500 font-medium tracking-wide dark:text-neutral-300/80">
      {{ aiSpotlight.demo.summary }}
    </p>

    <div
      data-reveal
      class="flex flex-col items-center gap-8 text-center"
    >
      <TuffShowcaseContainer>
        <TuffVortexBackground>
          <TuffShowcase />
        </TuffVortexBackground>
      </TuffShowcaseContainer>

      <!-- <p>
        <span class="block text-sm text-neutral-500/80 font-medium tracking-wide dark:text-neutral-300/70">
          {{ aiSpotlight.highlights[0]?.copy ?? 'Precision insights orchestrated for your next launch.' }}
        </span>
      </p> -->
    </div>
  </TuffLandingSection>
</template>
