<script setup lang="ts">
import { computed } from 'vue'

const { t, locale } = useI18n()
const router = useRouter()

const pioneerBenefitKeys = ['early', 'shape', 'community'] as const

const langTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const signInRoute = computed(() => ({
  path: '/sign-in',
  query: {
    lang: langTag.value,
    redirect_url: '/updates?channel=beta',
  },
}))

const pioneer = computed(() => ({
  eyebrow: t('landing.os.pioneer.eyebrow'),
  headline: t('landing.os.pioneer.headline'),
  subheadline: t('landing.os.pioneer.subheadline'),
  formTitle: t('landing.os.pioneer.formTitle'),
  cta: t('landing.os.pioneer.cta'),
  ctaPrimary: t('landing.os.pioneer.ctaPrimary'),
  benefits: pioneerBenefitKeys.map(key => ({
    title: t(`landing.os.pioneer.benefits.${key}.title`),
    copy: t(`landing.os.pioneer.benefits.${key}.copy`),
  })),
  guidance: t('landing.os.pioneer.guidance'),
}))

function goToSignIn() {
  router.push(signInRoute.value)
}
</script>

<template>
  <TuffLandingSection
    id="download"
    :sticky="pioneer.eyebrow"
    section-class="flex flex-col justify-center pb-32 pt-24"
    container-class="max-w-6xl w-full"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 48,
        duration: 1.05,
      },
    }"
  >
    <div class="overflow-hidden rounded-[32px] border border-white/10 bg-[#06070c]/95 px-8 py-16 text-center text-white shadow-[0_28px_110px_rgba(0,0,0,0.5)] sm:px-12 lg:px-16 lg:py-20">
      <div class="mx-auto flex max-w-4xl flex-col items-center gap-6">
        <span class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/65">
          {{ pioneer.eyebrow }}
        </span>
        <h2 class="text-3xl font-semibold text-white sm:text-4xl lg:text-5xl">
          {{ pioneer.headline }}
        </h2>
        <p class="text-base text-white/70 sm:text-lg">
          {{ pioneer.subheadline }}
        </p>
        <TxButton
          variant="bare"
          native-type="button"
          class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-black shadow-md transition motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          @click="goToSignIn"
        >
          <span class="i-carbon-login text-base" />
          {{ pioneer.ctaPrimary }}
        </TxButton>
        <p class="text-xs text-white/55">
          {{ pioneer.guidance }}
        </p>
        <ul class="flex flex-col gap-2 text-sm text-white/60 sm:flex-row sm:items-center sm:gap-6">
          <li
            v-for="benefit in pioneer.benefits"
            :key="benefit.title"
            class="flex items-center gap-2"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-white/40" />
            <span>{{ benefit.title }}</span>
          </li>
        </ul>
      </div>
    </div>
  </TuffLandingSection>
</template>
