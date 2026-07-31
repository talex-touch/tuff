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

/**
 * `tone` drives CTA weight so the page has one clear focal action per altitude:
 * `primary` on the featured plan, `solid` on the only plan you can actually
 * start today, and `soft` on the waitlist plans.
 */
interface PricingPlan {
  id: string
  featured: boolean
  comingSoon: boolean
  name: string
  price?: string
  hint: string
  desc: string
  features: string[]
  ctaLabel: string
  tone: 'primary' | 'solid' | 'soft'
  to: string
}

const plans = computed<PricingPlan[]>(() => [
  {
    id: 'free',
    featured: false,
    comingSoon: false,
    name: t('pricing.plans.free.name'),
    price: t('pricing.plans.free.price'),
    hint: t('pricing.freeHint'),
    desc: t('pricing.plans.free.desc'),
    features: [1, 2, 3, 4].map(n => t(`pricing.plans.free.feature${n}`)),
    ctaLabel: t('pricing.ctaFree'),
    tone: 'solid',
    to: '/sign-up',
  },
  {
    id: 'plus',
    featured: false,
    comingSoon: true,
    name: t('pricing.plans.plus.name'),
    hint: t('pricing.comingSoonHint'),
    desc: t('pricing.plans.plus.desc'),
    features: [1, 2, 3, 4].map(n => t(`pricing.plans.plus.feature${n}`)),
    ctaLabel: t('pricing.ctaWaitlist'),
    tone: 'soft',
    to: '/sign-up',
  },
  {
    id: 'pro',
    featured: true,
    comingSoon: true,
    name: t('pricing.plans.pro.name'),
    hint: t('pricing.comingSoonHint'),
    desc: t('pricing.plans.pro.desc'),
    features: [1, 2, 3, 4, 5].map(n => t(`pricing.plans.pro.feature${n}`)),
    ctaLabel: t('pricing.ctaWaitlist'),
    tone: 'primary',
    to: '/sign-up',
  },
  {
    id: 'team',
    featured: false,
    comingSoon: true,
    name: t('pricing.plans.team.name'),
    hint: t('pricing.comingSoonHint'),
    desc: t('pricing.plans.team.desc'),
    features: [1, 2, 3, 4].map(n => t(`pricing.plans.team.feature${n}`)),
    ctaLabel: t('pricing.ctaWaitlist'),
    tone: 'soft',
    to: '/sign-up',
  },
])

const ctaToneClass: Record<PricingPlan['tone'], string> = {
  primary: 'bg-primary text-white shadow-[0_16px_34px_-14px_rgba(27,181,244,0.9)] hover:bg-primary/90',
  solid: 'bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90',
  soft: 'bg-black/[0.055] text-black/80 hover:bg-black/[0.09] hover:text-black dark:bg-white/[0.09] dark:text-white/85 dark:hover:bg-white/[0.14] dark:hover:text-white',
}

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
    </div>

    <div class="relative mx-auto max-w-7xl">
      <!-- Header. `m-0` neutralises the UA margins on p/h1 — this app ships no
           CSS reset, so an unqualified <p> still carries `margin: 1em 0`. -->
      <header class="pricing-reveal mx-auto max-w-3xl text-center">
        <p class="m-0 mx-auto inline-flex items-center gap-2 rounded-full border border-black/8 bg-black/[0.03] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-black/60 backdrop-blur dark:border-white/12 dark:bg-white/[0.05] dark:text-white/70">
          <span class="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          {{ t('pricing.eyebrow') }}
        </p>
        <h1 class="pricing-balance m-0 mt-7 text-[2.75rem] font-bold leading-[1.06] tracking-[-0.035em] text-black sm:text-[3.5rem] dark:text-white">
          {{ t('pricing.title') }}
        </h1>
      </header>

      <!-- Plans -->
      <div class="mx-auto mt-16 grid grid-cols-1 items-stretch gap-4 sm:mt-24 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        <article
          v-for="(plan, index) in plans"
          :key="plan.id"
          class="pricing-reveal group relative flex flex-col rounded-[26px] p-6 transition duration-300"
          :style="{ animationDelay: `${60 + index * 60}ms` }"
          :class="plan.featured
            ? 'z-1 bg-white ring-1 ring-black/[0.06] shadow-[0_40px_90px_-34px_rgba(15,23,42,0.32)] dark:bg-white/[0.075] dark:ring-white/12 dark:shadow-[0_40px_90px_-34px_rgba(0,0,0,0.8)] xl:-my-7 xl:p-7'
            : 'bg-black/[0.035] hover:bg-black/[0.055] dark:bg-white/[0.045] dark:hover:bg-white/[0.07]'"
        >
          <!-- Featured sheen -->
          <div
            v-if="plan.featured"
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 top-0 h-44 rounded-t-[26px] bg-[radial-gradient(120%_100%_at_50%_0%,_rgba(27,181,244,0.16),_transparent_72%)]"
          />

          <!-- Plan name + inline badge -->
          <div class="relative flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span class="text-[15px] font-medium text-black/70 dark:text-white/70">
              {{ plan.name }}
            </span>
            <span
              v-if="plan.featured"
              class="inline-flex items-center rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-semibold text-primary dark:bg-primary/20"
            >
              {{ t('pricing.popular') }}
            </span>
          </div>

          <!-- Price hero: bottom-aligned via `gap`, so the hint lines share a
               baseline across cards even though the heroes differ in size.
               Coming-soon plans stay quiet on purpose — three shouting
               "Coming soon" blocks would out-weigh the one real price. -->
          <div class="relative mt-3 flex min-h-[4.5rem] flex-col justify-end gap-2">
            <p
              v-if="plan.comingSoon"
              class="plan-display-font m-0 text-[1.75rem] leading-[1.1]"
              :class="plan.featured ? 'text-primary' : 'text-black/45 dark:text-white/45'"
            >
              {{ t('pricing.comingSoon') }}
            </p>
            <p
              v-else
              class="plan-display-font m-0 flex items-baseline gap-1.5 text-[2.75rem] leading-[1.05] text-black dark:text-white"
            >
              {{ plan.price }}
              <span class="text-base font-medium text-black/45 dark:text-white/45">
                {{ t('pricing.perMonth') }}
              </span>
            </p>
            <p class="m-0 text-xs text-black/40 dark:text-white/40">
              {{ plan.hint }}
            </p>
          </div>

          <!-- Description -->
          <p class="relative m-0 mt-5 text-sm leading-relaxed text-black/55 dark:text-white/55">
            {{ plan.desc }}
          </p>

          <!-- Features -->
          <ul class="relative m-0 mt-5 list-none p-0 space-y-2.5">
            <li
              v-for="(feature, i) in plan.features"
              :key="i"
              class="flex items-start gap-2.5 text-sm leading-snug text-black/70 dark:text-white/70"
            >
              <span
                class="i-carbon-checkmark mt-0.5 flex-shrink-0 text-[13px]"
                :class="plan.featured ? 'text-primary' : 'text-black/35 dark:text-white/40'"
                aria-hidden="true"
              />
              <span>{{ feature }}</span>
            </li>
          </ul>

          <!-- CTA pinned to the card bottom so every plan's action lines up.
               `mt-auto` lives on the wrapper and the gap on its padding, so the
               two never fight over the same margin. -->
          <div class="relative mt-auto pt-8">
            <NuxtLink
              :to="plan.to"
              class="inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-3 text-sm font-semibold no-underline transition duration-200"
              :class="ctaToneClass[plan.tone]"
            >
              {{ plan.ctaLabel }}
              <span class="i-carbon-arrow-right text-sm transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </NuxtLink>
          </div>
        </article>
      </div>

      <!-- Reassurance strip -->
      <div class="pricing-reveal mx-auto mt-20 grid max-w-4xl gap-4 sm:grid-cols-3" style="animation-delay: 160ms">
        <div
          v-for="item in reassurances"
          :key="item.title"
          class="flex items-start gap-3 rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.035]"
        >
          <span class="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span :class="item.icon" class="text-lg" aria-hidden="true" />
          </span>
          <div>
            <p class="m-0 text-sm font-semibold text-black dark:text-white">
              {{ item.title }}
            </p>
            <p class="m-0 mt-1 text-xs leading-relaxed text-black/55 dark:text-white/55">
              {{ item.desc }}
            </p>
          </div>
        </div>
      </div>

      <!-- FAQ -->
      <div class="pricing-reveal mx-auto mt-24 max-w-3xl" style="animation-delay: 120ms">
        <div class="text-center">
          <h2 class="m-0 text-3xl font-bold tracking-[-0.02em] text-black dark:text-white">
            {{ t('pricing.faq.title') }}
          </h2>
          <p class="m-0 mt-3 text-sm text-black/55 dark:text-white/55">
            {{ t('pricing.faq.subtitle') }}
          </p>
        </div>
        <div class="mt-8 space-y-3">
          <details
            v-for="item in faqItems"
            :key="item.q"
            class="group overflow-hidden rounded-2xl bg-black/[0.03] px-5 py-4 transition dark:bg-white/[0.035]"
          >
            <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-black dark:text-white">
              <span>{{ item.q }}</span>
              <span class="i-carbon-add flex-shrink-0 text-lg text-black/40 transition duration-200 group-open:rotate-45 dark:text-white/40" aria-hidden="true" />
            </summary>
            <p class="m-0 mt-3 text-sm leading-relaxed text-black/55 dark:text-white/55">
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
   animates the standalone `translate` property so it never clobbers layout
   transforms, and avoids `filter`/blur entirely so the cards stay smooth. */
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

/* Keeps the display headline from dropping a single orphan word on its own line. */
.pricing-balance {
  text-wrap: balance;
}

@media (prefers-reduced-motion: reduce) {
  .pricing-reveal {
    animation: none;
  }
}
</style>
