<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

const communityChannelKeys = ['slack', 'github', 'events'] as const
const communityChannelIcons = {
  slack: 'i-carbon-logo-slack',
  github: 'i-carbon-logo-github',
  events: 'i-carbon-calendar-heat-map',
} as const

const communitySpotlightKeys = ['learning', 'newsletter'] as const
const communitySpotlightIcons = {
  learning: 'i-carbon-book',
  newsletter: 'i-carbon-email',
} as const

const community = computed(() => ({
  eyebrow: t('landing.os.community.eyebrow'),
  headline: t('landing.os.community.headline'),
  subheadline: t('landing.os.community.subheadline'),
  channels: communityChannelKeys.map(key => ({
    id: key,
    icon: communityChannelIcons[key],
    title: t(`landing.os.community.channels.${key}.title`),
    meta: t(`landing.os.community.channels.${key}.meta`),
    description: t(`landing.os.community.channels.${key}.description`),
    cta: t(`landing.os.community.channels.${key}.cta`),
    href: t(`landing.os.community.channels.${key}.href`),
  })),
  spotlights: communitySpotlightKeys.map(key => ({
    id: key,
    icon: communitySpotlightIcons[key],
    title: t(`landing.os.community.spotlights.${key}.title`),
    copy: t(`landing.os.community.spotlights.${key}.copy`),
  })),
}))
</script>

<template>
  <TuffLandingSection
    id="blog"
    :sticky="community.eyebrow"
    :title="community.headline"
    :subtitle="community.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full space-y-10"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 30,
        duration: 0.95,
      },
    }"
  >
    <template #decoration>
      <div class="absolute left-[-260px] top-1/2 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(192,132,252,0.22),_transparent_68%)] blur-3xl -translate-y-1/2" />
      <div class="absolute right-[-200px] top-[15%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.18),_transparent_70%)] blur-3xl" />
    </template>

    <div
      class="grid gap-7 lg:grid-cols-3"
      data-reveal
    >
      <article
        v-for="channel in community.channels"
        :key="channel.id"
        class="group relative h-full min-h-[320px] flex flex-col justify-between gap-7 overflow-hidden border border-white/12 rounded-[30px] bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-8 text-center text-white shadow-[0_26px_95px_rgba(6,18,52,0.4)] backdrop-blur-[6px] transition duration-300 hover:border-white/30 hover:bg-[linear-gradient(160deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04))] hover:-translate-y-1"
      >
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2),_transparent_72%)] opacity-70 transition duration-300 group-hover:opacity-100" />
        <div class="relative flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.32em] text-white/50">
          <span>{{ channel.meta }}</span>
          <span class="i-carbon-arrow-up-right text-base text-white/40 transition group-hover:text-white/70" aria-hidden="true" />
        </div>
        <div class="relative flex flex-col items-center gap-5">
          <span class="size-14 inline-flex items-center justify-center rounded-[22px] bg-white/15 text-white shadow-[0_20px_45px_rgba(4,16,52,0.38)]">
            <span :class="channel.icon" class="text-2xl" aria-hidden="true" />
          </span>
          <div class="space-y-2">
            <h3 class="text-2xl font-semibold">
              {{ channel.title }}
            </h3>
            <p class="text-sm text-white/70 leading-relaxed">
              {{ channel.description }}
            </p>
          </div>
        </div>
        <NuxtLink
          :to="channel.href"
          class="relative inline-flex items-center justify-center gap-2 text-sm text-white font-semibold transition hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          {{ channel.cta }}
          <span class="i-carbon-arrow-right text-base" aria-hidden="true" />
        </NuxtLink>
      </article>
    </div>

    <div
      class="grid gap-4 md:grid-cols-2"
      data-reveal
    >
      <article
        v-for="spotlight in community.spotlights"
        :key="spotlight.id"
        class="relative overflow-hidden border border-white/10 rounded-[26px] bg-white/4 px-7 py-6 text-left text-white shadow-[0_20px_70px_rgba(5,16,52,0.32)]"
      >
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_70%)] opacity-70" />
        <div class="relative flex items-start gap-4">
          <span class="size-10 inline-flex flex-shrink-0 items-center justify-center rounded-2xl bg-white/12 text-white shadow-[0_16px_36px_rgba(5,16,52,0.32)]">
            <span :class="spotlight.icon" class="text-lg" aria-hidden="true" />
          </span>
          <div class="space-y-1.5">
            <h3 class="text-lg font-semibold leading-tight">
              {{ spotlight.title }}
            </h3>
            <p class="text-sm text-white/70 leading-relaxed">
              {{ spotlight.copy }}
            </p>
          </div>
        </div>
      </article>
    </div>
  </TuffLandingSection>
</template>
