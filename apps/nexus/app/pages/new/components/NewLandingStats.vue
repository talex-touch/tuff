<script setup lang="ts">
import { computed } from 'vue'
import BorderGlow from './BorderGlow.vue'
import TuffLandingSection from '~/components/tuff/landing/TuffLandingSection.vue'
import TuffShowcase from '~/components/tuff/landing/showcase/TuffShowcase.vue'

const { t } = useI18n()

const aiResultKeys = ['figma', 'files', 'gmail', 'slack'] as const
const aiResultIcons = {
  figma: 'i-ri-figma-fill',
  files: 'i-carbon-document',
  gmail: 'i-carbon-email',
  slack: 'i-carbon-logo-slack',
} as const

const aiHighlightKeys = ['context', 'silo', 'breathe'] as const

function buildSummaryParts(summary: string, highlight: string) {
  if (!summary)
    return []

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
      class="new-stats-body flex flex-col items-center gap-8 text-center"
    >
      <div class="new-stats-showcase">
        <div class="new-stats-showcase-frame">
          <BorderGlow
            class-name="new-stats-border"
            :edge-sensitivity="24"
            glow-color="266 92 78"
            background-color="#050608"
            :border-radius="28"
            :glow-radius="54"
            :glow-intensity="0.78"
            :cone-spread="23"
            :animated="false"
            :fill-opacity="0.28"
            :base-border-opacity="0.62"
            :base-glow-opacity="0.36"
            :colors="['#8b5cf6', '#f472b6', '#38bdf8']"
          >
            <TuffShowcase />
          </BorderGlow>

          <p
            data-reveal
            class="new-stats-summary mx-auto my-0 max-w-3xl text-sm text-neutral-500 font-medium tracking-wide dark:text-neutral-300/80"
          >
            <span
              v-for="(part, index) in aiSpotlight.demo.summaryParts"
              :key="index"
              :class="part.highlight ? 'text-black dark:text-white font-bold' : undefined"
            >
              {{ part.text }}
            </span>
          </p>
        </div>
      </div>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.new-stats-body {
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1;
}

.new-stats-showcase {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.new-stats-showcase-frame {
  position: relative;
  display: flex;
  width: min(100%, 1280px, calc(177.777dvh - 7.1rem));
  max-width: 100%;
  align-items: center;
  justify-content: center;
}

.new-stats-border {
  width: 100%;
  max-width: 100%;
}

.new-stats-border :deep(.tuff-showcase) {
  --showcase-effective-width: 100%;

  width: 100%;
  max-width: 100%;
  max-height: 100%;
  gap: clamp(0.5rem, 1.2vh, 1.5rem);
  padding: clamp(0.5rem, 1.2vh, 1rem);
}

.new-stats-border :deep(.tuff-showcase-mock-header) {
  flex-shrink: 0;
}

.new-stats-border :deep(.tuff-showcase-displayer) {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  gap: clamp(0.45rem, 1.2vh, 1.4rem);
}

.new-stats-border :deep(.tuff-showcase-displayer__viewport) {
  flex: 1 1 auto;
  min-height: 0;
}

.new-stats-border :deep(.tuff-showcase-displayer__controls) {
  flex-shrink: 0;
}

.new-stats-summary {
  position: absolute;
  top: calc(100% + clamp(0.35rem, 0.8vh, 0.65rem));
  left: 50%;
  width: min(calc(100vw - 2rem), 48rem);
  transform: translateX(-50%);
}
</style>
