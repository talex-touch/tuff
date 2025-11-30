<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

const pricingFeatureKeys = ['unlimited', 'support', 'roadmap'] as const

const pricing = computed(() => ({
  eyebrow: t('landing.os.pricing.eyebrow'),
  headline: t('landing.os.pricing.headline'),
  subheadline: t('landing.os.pricing.subheadline'),
  plan: {
    name: t('landing.os.pricing.plan.name'),
    price: t('landing.os.pricing.plan.price'),
    period: t('landing.os.pricing.plan.period'),
    features: pricingFeatureKeys.map(key => ({
      id: key,
      copy: t(`landing.os.pricing.plan.features.${key}`),
    })),
    footnote: t('landing.os.pricing.plan.footnote'),
  },
}))

const plan = computed(() => pricing.value.plan)
const features = computed(() => plan.value.features ?? [])
</script>

<template>
  <TuffLandingSection
    id="pricing"
    :sticky="pricing.eyebrow"
    :title="pricing.headline"
    :subtitle="pricing.subheadline"
    section-class="flex flex-col justify-center"
    container-class="max-w-4xl w-full space-y-10"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 34,
        duration: 1,
      },
    }"
  >
    <template #decoration>
      <div class="absolute left-[-260px] top-[30%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(244,114,182,0.2),_transparent_70%)] blur-3xl" />
      <div class="absolute bottom-[-140px] right-[-260px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(34,211,238,0.18),_transparent_70%)] blur-3xl" />
    </template>

    <article
      data-reveal
      class="relative overflow-hidden border border-white/12 rounded-[32px] bg-white/6 px-10 py-12 text-white shadow-[0_28px_110px_rgba(8,16,48,0.38)]"
    >
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_70%)] opacity-80" />
      <div class="relative space-y-8">
        <header class="text-center space-y-3">
          <h3 class="text-3xl font-semibold">
            {{ plan.name }}
          </h3>
          <p class="text-sm text-white/70 font-semibold tracking-[0.28em] uppercase">
            {{ plan.period }}
          </p>
          <p class="text-5xl font-semibold tracking-tight">
            {{ plan.price }}
          </p>
        </header>

        <ul class="text-left space-y-3">
          <li
            v-for="feature in features"
            :key="feature.id"
            class="flex items-start gap-3 text-sm text-white/75 leading-relaxed"
          >
            <span class="mt-1 size-2.5 inline-flex flex-shrink-0 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.6)]" />
            <span>{{ feature.copy }}</span>
          </li>
        </ul>

        <footer class="text-center text-sm text-white/60">
          {{ plan.footnote }}
        </footer>
      </div>
    </article>
  </TuffLandingSection>
</template>
