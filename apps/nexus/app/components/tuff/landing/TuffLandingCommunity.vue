<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

const communityChannelKeys = ['slack', 'github', 'events'] as const
const communityChannelIcons = {
  slack: 'i-carbon-logo-slack',
  github: 'i-carbon-logo-github',
  events: 'i-carbon-calendar-heat-map',
} as const
const communityChannelColors = {
  slack: '#a78bfa',
  github: '#f8fafc',
  events: '#60a5fa',
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
    color: communityChannelColors[key],
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
    container-class="max-w-5xl w-full space-y-8"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 30,
        duration: 0.95,
      },
    }"
  >
    <template #decoration>
      <div class="absolute left-[-260px] top-1/2 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(168,85,247,0.12),_transparent_68%)] blur-3xl -translate-y-1/2" />
      <div class="absolute right-[-200px] top-[15%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.10),_transparent_70%)] blur-3xl" />
    </template>

    <!-- Channel cards -->
    <div class="grid gap-4 lg:grid-cols-3" data-reveal>
      <NuxtLink
        v-for="channel in community.channels"
        :key="channel.id"
        :to="channel.href"
        class="group flex flex-col gap-5 border border-white/[0.08] rounded-2xl bg-white/[0.03] px-6 py-6 no-underline"
      >
        <!-- Icon -->
        <span
          class="size-11 inline-flex items-center justify-center rounded-xl"
          :style="{ background: `${channel.color}15` }"
        >
          <span :class="channel.icon" class="text-xl" :style="{ color: channel.color }" aria-hidden="true" />
        </span>

        <!-- Text -->
        <div class="flex flex-1 flex-col gap-2">
          <div class="flex items-center gap-2">
            <h3 class="text-[15px] font-semibold text-white/90">
              {{ channel.title }}
            </h3>
            <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/35 uppercase tracking-wider">
              {{ channel.meta }}
            </span>
          </div>
          <p class="text-[13px] text-white/45 leading-relaxed">
            {{ channel.description }}
          </p>
        </div>

        <!-- CTA -->
        <span class="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/50">
          {{ channel.cta }}
          <span class="i-carbon-arrow-right text-xs" aria-hidden="true" />
        </span>
      </NuxtLink>
    </div>

    <!-- Spotlight row -->
    <div class="grid gap-4 md:grid-cols-2" data-reveal>
      <article
        v-for="spotlight in community.spotlights"
        :key="spotlight.id"
        class="flex items-start gap-4 border border-white/[0.06] rounded-xl bg-white/[0.02] px-5 py-4"
      >
        <span class="size-9 mt-0.5 inline-flex flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/50">
          <span :class="spotlight.icon" class="text-base" aria-hidden="true" />
        </span>
        <div>
          <h3 class="text-sm font-semibold text-white/85">
            {{ spotlight.title }}
          </h3>
          <p class="mt-1 text-[13px] text-white/40 leading-relaxed">
            {{ spotlight.copy }}
          </p>
        </div>
      </article>
    </div>
  </TuffLandingSection>
</template>
