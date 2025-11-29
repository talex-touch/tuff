<script setup lang="ts">
import { computed } from 'vue'

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
}))
</script>

<template>
  <TuffLandingSection
    id="developer"
    :sticky="openFoundation.eyebrow"
    :title="openFoundation.headline"
    :subtitle="openFoundation.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full"
    header-class="py-6 text-white"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 36,
        duration: 1,
      },
    }"
  >
    <template #decoration>
      <div class="absolute left-0 top-1/3 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(44,96,200,0.28),_transparent_65%)] blur-3xl -translate-x-1/2" />
      <div class="absolute inset-y-0 right-[-240px] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(30,120,110,0.24),_transparent_70%)] blur-3xl" />
    </template>

    <div class="grid mt-12 gap-5 pb-16 lg:grid-cols-3 md:grid-cols-2">
      <article
        v-for="pillar in openFoundation.pillars"
        :key="pillar.id"
        data-reveal
        class="group h-full flex flex-col gap-6 border border-white/10 rounded-[28px] bg-white/5 p-8 text-left text-white/70 shadow-[0_32px_120px_rgba(3,15,59,0.35)] transition duration-500 hover:border-white/30 hover:bg-white/10 hover:-translate-y-1"
      >
        <span class="h-12 w-12 inline-flex items-center justify-center border border-white/10 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16),_rgba(12,20,43,0.52))] text-white shadow-[0_24px_40px_rgba(0,0,0,0.4)]">
          <span :class="pillar.icon" class="text-xl text-[#7fd3ff]" aria-hidden="true" />
        </span>
        <div class="text-white space-y-2">
          <h3 class="text-lg text-white font-semibold">
            {{ pillar.title }}
          </h3>
        </div>
        <p class="text-sm text-white/70 leading-relaxed">
          {{ pillar.copy }}
        </p>
      </article>
    </div>

    <footer
      data-reveal
      class="relative overflow-hidden border border-white/10 rounded-[24px] bg-white/5 px-6 py-5 text-center text-sm text-white/60 shadow-[0_24px_80px_rgba(3,15,59,0.28)]"
    >
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,166,255,0.18),_transparent_70%)] opacity-70" />
      <span class="relative block">
        {{ openFoundation.footnote }}
      </span>
    </footer>
  </TuffLandingSection>
</template>
