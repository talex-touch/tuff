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

const buildSummaryParts = (summary: string, highlight: string) => {
  if (!summary) {
    return []
  }

  if (!highlight || !summary.includes(highlight)) {
    return [{ text: summary, highlight: false }]
  }

  const marker = '__SUMMARY_HIGHLIGHT__'
  const replaced = summary.replace(highlight, `${marker}${highlight}${marker}`)

  return replaced
    .split(marker)
    .filter(part => part.length > 0)
    .map(part => ({
      text: part,
      highlight: part === highlight,
    }))
}

const aiSpotlight = computed(() => {
  const summary = t('landing.os.aiSpotlight.summary')
  const summaryHighlight = t('landing.os.aiSpotlight.summaryHighlight')

  return {
    eyebrow: t('landing.os.aiSpotlight.eyebrow'),
    headline: t('landing.os.aiSpotlight.headline'),
    subheadline: t('landing.os.aiSpotlight.subheadline'),
    demo: {
      summaryParts: buildSummaryParts(summary, summaryHighlight),
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
  }
})
</script>

<template>
  <TuffLandingSection
    id="landing-stats"
    :sticky="aiSpotlight.eyebrow"
    :title="aiSpotlight.headline"
    :subtitle="aiSpotlight.subheadline"
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
    <div
      data-reveal
      class="tuff-stats-body flex flex-col items-center gap-8 text-center"
    >
      <div class="tuff-stats-showcase">
        <TuffShowcaseContainer>
          <TuffVortexBackground>
            <TuffShowcase />
          </TuffVortexBackground>
        </TuffShowcaseContainer>
      </div>

      <p
        data-reveal
        class="mx-auto my-0 max-w-3xl text-sm text-neutral-500 font-medium tracking-wide dark:text-neutral-300/80"
      >
        <span
          v-for="(part, index) in aiSpotlight.demo.summaryParts"
          :key="index"
          :class="part.highlight ? 'text-white font-bold' : undefined"
        >
          {{ part.text }}
        </span>
      </p>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.tuff-stats-body {
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1;
}

.tuff-stats-showcase {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tuff-stats-showcase :deep(.tuff-showcase) {
  max-width: 100%;
  max-height: 100%;
}
</style>
