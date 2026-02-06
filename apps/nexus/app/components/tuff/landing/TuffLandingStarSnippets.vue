<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

const starSnippetCategoryKeys = ['meetings', 'support', 'builders'] as const
const starSnippetCategoryIcons = {
  meetings: 'i-carbon-calendar-schedule',
  support: 'i-carbon-chat',
  builders: 'i-carbon-rocket',
} as const
const starSnippetCategoryAccents = {
  meetings: 'bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_70%)]',
  support: 'bg-[radial-gradient(circle_at_top,_rgba(244,114,182,0.18),_transparent_70%)]',
  builders: 'bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.18),_transparent_70%)]',
} as const

const starSnippets = computed(() => ({
  eyebrow: t('landing.os.starSnippets.eyebrow'),
  headline: t('landing.os.starSnippets.headline'),
  subheadline: t('landing.os.starSnippets.subheadline'),
  categories: starSnippetCategoryKeys.map(key => ({
    id: key,
    icon: starSnippetCategoryIcons[key],
    accent: starSnippetCategoryAccents[key],
    title: t(`landing.os.starSnippets.categories.${key}.title`),
    copy: t(`landing.os.starSnippets.categories.${key}.copy`),
    action: t(`landing.os.starSnippets.categories.${key}.action`),
  })),
  footnote: t('landing.os.starSnippets.footnote'),
}))
</script>

<template>
  <TuffLandingSection
    :sticky="starSnippets.eyebrow"
    :title="starSnippets.headline"
    :subtitle="starSnippets.subheadline"
    section-class="flex flex-col justify-center"
    container-class="max-w-6xl w-full space-y-10"
    title-class="text-[clamp(2rem,1vw+2.3rem,3rem)]"
    subtitle-class="mx-auto my-0 max-w-3xl text-[clamp(.68rem,1vw+1.2rem,1.08rem)] text-white/70 font-semibold leading-relaxed"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 32,
        duration: 0.98,
      },
    }"
  >
    <template #decoration>
      <div class="absolute left-[-240px] top-[20%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(20,184,166,0.2),_transparent_70%)] blur-3xl" />
      <div class="absolute right-[-200px] bottom-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(147,51,234,0.22),_transparent_70%)] blur-3xl" />
    </template>

    <div class="grid gap-6 md:grid-cols-3" data-reveal>
      <article
        v-for="category in starSnippets.categories"
        :key="category.id"
        class="group relative flex h-full flex-col justify-between gap-6 overflow-hidden border border-white/12 rounded-[28px] bg-white/5 p-8 text-left text-white shadow-[0_24px_90px_rgba(4,16,52,0.34)] transition duration-300 hover:border-white/25 hover:bg-white/9 hover:-translate-y-1"
      >
        <div class="pointer-events-none absolute inset-0 opacity-80 transition duration-300 group-hover:opacity-100" :class="category.accent" />
        <div class="relative space-y-5">
          <span class="inline-flex size-12 items-center justify-center rounded-2xl bg-white/15 text-white shadow-[0_20px_45px_rgba(4,16,52,0.38)]">
            <span :class="category.icon" class="text-xl" aria-hidden="true" />
          </span>
          <div class="space-y-2">
            <h3 class="text-xl font-semibold">
              {{ category.title }}
            </h3>
            <p class="text-sm text-white/70 leading-relaxed">
              {{ category.copy }}
            </p>
          </div>
        </div>
        <div class="relative">
          <TxButton
            variant="bare"
            size="small"
            native-type="button"
            class="inline-flex items-center gap-2 text-sm text-white font-semibold transition hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            {{ category.action }}
            <span class="i-carbon-arrow-up-right text-base" aria-hidden="true" />
          </TxButton>
        </div>
      </article>
    </div>

    <footer
      class="relative overflow-hidden border border-white/10 rounded-[24px] bg-white/4 px-6 py-5 text-center text-sm text-white/70 shadow-[0_20px_70px_rgba(5,16,52,0.28)]"
    >
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_70%)] opacity-70" />
      <span class="relative">
        {{ starSnippets.footnote }}
      </span>
    </footer>
  </TuffLandingSection>
</template>
