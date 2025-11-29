<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

const aggregationPanelKeys = ['overview', 'timelines', 'alerts'] as const
const aggregationPanelIcons = {
  overview: 'i-carbon-dashboard',
  timelines: 'i-carbon-time',
  alerts: 'i-carbon-notification',
} as const

const aggregation = computed(() => ({
  eyebrow: t('landing.os.aggregation.eyebrow'),
  headline: t('landing.os.aggregation.headline'),
  subheadline: t('landing.os.aggregation.subheadline'),
  panels: aggregationPanelKeys.map(key => ({
    id: key,
    icon: aggregationPanelIcons[key],
    title: t(`landing.os.aggregation.panels.${key}.title`),
    copy: t(`landing.os.aggregation.panels.${key}.copy`),
  })),
  footnote: t('landing.os.aggregation.footnote'),
}))
</script>

<template>
  <TuffLandingSection
    :sticky="aggregation.eyebrow"
    :title="aggregation.headline"
    :subtitle="aggregation.subheadline"
    section-class="flex flex-col justify-center"
    container-class="max-w-6xl w-full space-y-10"
    title-class="text-[clamp(2rem,1vw+2.3rem,3rem)]"
    subtitle-class="mx-auto my-0 max-w-3xl text-[clamp(.68rem,1vw+1.2rem,1.08rem)] text-white/70 font-semibold leading-relaxed"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 34,
        duration: 1,
      },
    }"
  >
    <template #decoration>
      <div class="absolute left-[-240px] top-[25%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.18),_transparent_70%)] blur-3xl" />
      <div class="absolute right-[-220px] bottom-[-140px] h-[540px] w-[540px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(34,197,94,0.18),_transparent_70%)] blur-3xl" />
    </template>

    <div class="grid gap-6 md:grid-cols-3" data-reveal>
      <article
        v-for="panel in aggregation.panels"
        :key="panel.id"
        class="group relative flex h-full flex-col gap-5 overflow-hidden border border-white/12 rounded-[28px] bg-white/5 p-8 text-left text-white shadow-[0_24px_90px_rgba(6,18,52,0.34)] transition duration-300 hover:border-white/25 hover:bg-white/9 hover:-translate-y-1"
      >
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_70%)] opacity-70 transition duration-300 group-hover:opacity-100" />
        <div class="relative space-y-4">
          <span class="inline-flex size-12 items-center justify-center rounded-2xl bg-white/15 text-white shadow-[0_18px_40px_rgba(4,16,52,0.36)]">
            <span :class="panel.icon" class="text-xl" aria-hidden="true" />
          </span>
          <div class="space-y-2">
            <h3 class="text-xl font-semibold">
              {{ panel.title }}
            </h3>
            <p class="text-sm text-white/70 leading-relaxed">
              {{ panel.copy }}
            </p>
          </div>
        </div>
      </article>
    </div>

    <footer
      class="relative overflow-hidden border border-white/10 rounded-[24px] bg-white/4 px-6 py-5 text-center text-sm text-white/70 shadow-[0_20px_70px_rgba(6,16,48,0.3)]"
    >
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_70%)] opacity-70" />
      <span class="relative">
        {{ aggregation.footnote }}
      </span>
    </footer>
  </TuffLandingSection>
</template>
