<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

const faqItemKeys = ['access', 'privacy', 'build', 'migration', 'pricing'] as const

const faq = computed(() => ({
  eyebrow: t('landing.os.faq.eyebrow'),
  headline: t('landing.os.faq.headline'),
  items: faqItemKeys.map(key => ({
    id: key,
    question: t(`landing.os.faq.items.${key}.question`),
    answer: t(`landing.os.faq.items.${key}.answer`),
  })),
}))
</script>

<template>
  <TuffLandingSection
    :sticky="faq.eyebrow"
    :title="faq.headline"
    title-class="text-[clamp(2rem,1vw+2.3rem,3rem)]"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-5xl w-full space-y-10"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 28,
        duration: 0.9,
      },
    }"
  >
    <template #decoration>
      <div class="absolute left-[-220px] top-[30%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(236,72,153,0.16),_transparent_70%)] blur-3xl" />
      <div class="absolute bottom-[-120px] right-[-240px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.18),_transparent_70%)] blur-3xl" />
    </template>

    <div class="space-y-4" data-reveal>
      <details
        v-for="item in faq.items"
        :key="item.id"
        class="group overflow-hidden border border-white/10 rounded-[24px] bg-white/4 px-6 py-5 text-left text-white shadow-[0_20px_70px_rgba(6,16,48,0.32)] transition"
      >
        <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold leading-tight">
          <span>{{ item.question }}</span>
          <span class="i-carbon-add text-xl transition group-open:rotate-45" aria-hidden="true" />
        </summary>
        <p class="mt-3 text-sm text-white/70 leading-relaxed">
          {{ item.answer }}
        </p>
      </details>
    </div>
  </TuffLandingSection>
</template>
