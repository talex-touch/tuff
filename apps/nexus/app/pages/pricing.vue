<script setup lang="ts">
import { computed } from 'vue'

definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

const { t } = useI18n()
const pageTitle = computed(() => t('nav.pricing', 'Pricing'))
const pageDescription = computed(() => t('pricing.subtitle', 'Choose the plan that matches your momentum.'))
useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
  description: pageDescription,
  ogDescription: pageDescription,
})

interface PricingPlan {
  id: string
  icon: string
  featured: boolean
  comingSoon: boolean
  name: string
  price?: string
  desc: string
  features: string[]
  ctaLabel: string
  to: string
}

const plans = computed<PricingPlan[]>(() => [
  {
    id: 'free',
    icon: 'i-carbon-rocket',
    featured: false,
    comingSoon: false,
    name: t('pricing.plans.free.name'),
    price: t('pricing.plans.free.price'),
    desc: t('pricing.plans.free.desc'),
    features: [1, 2, 3, 4].map(n => t(`pricing.plans.free.feature${n}`)),
    ctaLabel: t('pricing.ctaFree'),
    to: '/sign-up',
  },
  {
    id: 'plus',
    icon: 'i-carbon-star',
    featured: false,
    comingSoon: true,
    name: t('pricing.plans.plus.name'),
    desc: t('pricing.plans.plus.desc'),
    features: [1, 2, 3, 4].map(n => t(`pricing.plans.plus.feature${n}`)),
    ctaLabel: t('pricing.ctaWaitlist'),
    to: '/sign-up',
  },
  {
    id: 'pro',
    icon: 'i-carbon-lightning',
    featured: true,
    comingSoon: true,
    name: t('pricing.plans.pro.name'),
    desc: t('pricing.plans.pro.desc'),
    features: [1, 2, 3, 4, 5].map(n => t(`pricing.plans.pro.feature${n}`)),
    ctaLabel: t('pricing.ctaWaitlist'),
    to: '/sign-up',
  },
  {
    id: 'team',
    icon: 'i-carbon-group',
    featured: false,
    comingSoon: true,
    name: t('pricing.plans.team.name'),
    desc: t('pricing.plans.team.desc'),
    features: [1, 2, 3, 4].map(n => t(`pricing.plans.team.feature${n}`)),
    ctaLabel: t('pricing.ctaWaitlist'),
    to: '/sign-up',
  },
])

const reassurances = computed(() => [
  { icon: 'i-carbon-renew', title: t('pricing.reassure.item1Title'), desc: t('pricing.reassure.item1Desc') },
  { icon: 'i-carbon-locked', title: t('pricing.reassure.item2Title'), desc: t('pricing.reassure.item2Desc') },
  { icon: 'i-carbon-devices', title: t('pricing.reassure.item3Title'), desc: t('pricing.reassure.item3Desc') },
])

const faqItems = computed(() => [1, 2, 3, 4].map(n => ({
  q: t(`pricing.faq.q${n}`),
  a: t(`pricing.faq.a${n}`),
})))
</script>

<template>
  <section class="relative overflow-hidden px-6 pb-28 pt-32 sm:px-8 sm:pt-36 lg:px-12">
    <!-- Ambient background decoration -->
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute left-1/2 top-[-12%] h-[540px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,_rgba(27,181,244,0.18),_transparent_70%)] blur-3xl" />
      <div class="absolute bottom-[6%] right-[-8%] h-[440px] w-[440px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(27,181,244,0.10),_transparent_70%)] blur-3xl" />
      <div class="absolute inset-0 bg-[linear-gradient(to_bottom,_transparent,_transparent_70%,_rgba(255,255,255,0)_100%)]" />
    </div>

    <div class="relative mx-auto max-w-7xl">
      <!-- Header -->
      <header class="pricing-reveal mx-auto max-w-2xl text-center">
        <p class="mx-auto inline-flex items-center gap-2 rounded-full border border-black/8 bg-black/[0.03] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-black/60 backdrop-blur dark:border-white/12 dark:bg-white/[0.05] dark:text-white/70">
          <span class="i-carbon-flash text-sm text-primary" aria-hidden="true" />
          {{ t('pricing.eyebrow') }}
        </p>
        <h1 class="mt-6 text-4xl font-semibold leading-tight tracking-tight text-black sm:text-5xl dark:text-white">
          {{ t('pricing.title') }}
        </h1>
        <p class="mx-auto mt-5 max-w-xl text-base text-black/60 sm:text-lg dark:text-white/60">
          {{ t('pricing.subtitle') }}
        </p>
        <p class="mt-4 text-sm text-black/45 dark:text-white/45">
          {{ t('pricing.note') }}
        </p>
      </header>

      <!-- Plans -->
      <div class="mx-auto mt-14 grid grid-cols-1 gap-5 sm:mt-16 sm:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="(plan, index) in plans"
          :key="plan.id"
          class="pricing-reveal group relative flex flex-col rounded-3xl border p-6 backdrop-blur-xl transition duration-300"
          :style="{ animationDelay: `${60 + index * 60}ms` }"
          :class="plan.featured
            ? 'border-primary/40 bg-primary/5 shadow-[0_30px_80px_-32px_rgba(27,181,244,0.5)] ring-1 ring-primary/15 dark:bg-primary/10 xl:-translate-y-4'
            : 'border-black/8 bg-white/70 hover:-translate-y-1 hover:border-black/12 hover:shadow-[0_24px_60px_-34px_rgba(0,0,0,0.4)] dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-white/20'"
        >
          <!-- Featured sheen + badge -->
          <div
            v-if="plan.featured"
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-t-3xl bg-[radial-gradient(120%_100%_at_50%_0%,_rgba(27,181,244,0.18),_transparent_70%)]"
          />
          <div
            v-if="plan.featured"
            class="absolute left-1/2 top-0 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-[0_10px_28px_-8px_rgba(27,181,244,0.8)]"
          >
            <span class="i-carbon-star-filled text-[11px]" aria-hidden="true" />
            {{ t('pricing.popular') }}
          </div>

          <!-- Plan identity -->
          <div class="relative flex items-center gap-3">
            <span
              class="inline-flex h-11 w-11 items-center justify-center rounded-2xl"
              :class="plan.featured ? 'bg-primary/15 text-primary' : 'bg-black/5 text-black/70 dark:bg-white/8 dark:text-white/70'"
            >
              <span :class="plan.icon" class="text-xl" aria-hidden="true" />
            </span>
            <span class="text-base font-semibold text-black dark:text-white">
              {{ plan.name }}
            </span>
          </div>

          <!-- Price -->
          <div class="relative mt-6 flex h-[4.25rem] flex-col justify-end">
            <template v-if="plan.comingSoon">
              <span class="inline-flex w-fit items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-xs font-medium text-black/60 dark:border-white/12 dark:bg-white/[0.05] dark:text-white/65">
                <span class="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {{ t('pricing.comingSoon') }}
              </span>
              <span class="mt-2 text-xs text-black/40 dark:text-white/40">
                {{ t('pricing.comingSoonHint') }}
              </span>
            </template>
            <template v-else>
              <div class="flex items-end gap-1.5">
                <span class="text-4xl font-semibold tracking-tight text-black dark:text-white">
                  {{ plan.price }}
                </span>
                <span class="pb-1.5 text-sm text-black/50 dark:text-white/50">
                  {{ t('pricing.perMonth') }}
                </span>
              </div>
            </template>
          </div>

          <!-- Description -->
          <p class="relative mt-4 min-h-[2.75rem] text-sm leading-relaxed text-black/55 dark:text-white/55">
            {{ plan.desc }}
          </p>

          <!-- CTA -->
          <NuxtLink
            :to="plan.to"
            class="relative mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition duration-200"
            :class="plan.featured
              ? 'bg-primary text-white shadow-[0_14px_34px_-12px_rgba(27,181,244,0.75)] hover:bg-primary/90'
              : plan.id === 'free'
                ? 'bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90'
                : 'border border-black/12 text-black hover:bg-black/[0.04] dark:border-white/15 dark:text-white dark:hover:bg-white/[0.06]'"
          >
            {{ plan.ctaLabel }}
            <span class="i-carbon-arrow-right text-sm transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </NuxtLink>

          <!-- Feature divider -->
          <div class="relative mt-7 flex items-center gap-3">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
              {{ t('pricing.included') }}
            </span>
            <span class="h-px flex-1 bg-gradient-to-r from-black/12 to-transparent dark:from-white/12" />
          </div>

          <!-- Features -->
          <ul class="relative mt-4 space-y-3">
            <li
              v-for="(feature, i) in plan.features"
              :key="i"
              class="flex items-start gap-2.5 text-sm leading-snug text-black/70 dark:text-white/70"
            >
              <span
                class="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
                :class="plan.featured ? 'bg-primary/15 text-primary' : 'bg-black/6 text-black/55 dark:bg-white/10 dark:text-white/60'"
              >
                <span class="i-carbon-checkmark text-[10px]" aria-hidden="true" />
              </span>
              <span>{{ feature }}</span>
            </li>
          </ul>
        </article>
      </div>

      <!-- Reassurance strip -->
      <div class="pricing-reveal mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3" style="animation-delay: 160ms">
        <div
          v-for="item in reassurances"
          :key="item.title"
          class="flex items-start gap-3 rounded-2xl border border-black/6 bg-white/50 p-4 backdrop-blur dark:border-white/8 dark:bg-white/[0.025]"
        >
          <span class="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span :class="item.icon" class="text-lg" aria-hidden="true" />
          </span>
          <div>
            <p class="text-sm font-semibold text-black dark:text-white">
              {{ item.title }}
            </p>
            <p class="mt-0.5 text-xs leading-relaxed text-black/55 dark:text-white/55">
              {{ item.desc }}
            </p>
          </div>
        </div>
      </div>

      <!-- FAQ -->
      <div class="pricing-reveal mx-auto mt-20 max-w-3xl" style="animation-delay: 120ms">
        <div class="text-center">
          <h2 class="text-2xl font-semibold tracking-tight text-black dark:text-white">
            {{ t('pricing.faq.title') }}
          </h2>
          <p class="mt-2 text-sm text-black/55 dark:text-white/55">
            {{ t('pricing.faq.subtitle') }}
          </p>
        </div>
        <div class="mt-8 space-y-3">
          <details
            v-for="item in faqItems"
            :key="item.q"
            class="group overflow-hidden rounded-2xl border border-black/8 bg-white/60 px-5 py-4 backdrop-blur transition dark:border-white/10 dark:bg-white/[0.03]"
          >
            <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-black dark:text-white">
              <span>{{ item.q }}</span>
              <span class="i-carbon-add flex-shrink-0 text-lg text-black/40 transition duration-200 group-open:rotate-45 dark:text-white/40" aria-hidden="true" />
            </summary>
            <p class="mt-3 text-sm leading-relaxed text-black/55 dark:text-white/55">
              {{ item.a }}
            </p>
          </details>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* CSS-only entrance: paints hidden on the first frame (no JS-import flash),
   animates the standalone `translate` property so it never clobbers the
   featured card's `xl:-translate-y-4` (which lives on `transform`), and
   avoids `filter`/blur entirely so the backdrop-blur cards stay smooth. */
@keyframes pricing-reveal-in {
  from {
    opacity: 0;
    translate: 0 16px;
  }

  to {
    opacity: 1;
    translate: 0 0;
  }
}

.pricing-reveal {
  animation: pricing-reveal-in 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@media (prefers-reduced-motion: reduce) {
  .pricing-reveal {
    animation: none;
  }
}
</style>
