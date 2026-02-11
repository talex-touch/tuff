<script setup lang="ts">
import { computed } from 'vue'

const { t, locale } = useI18n()
const router = useRouter()

const pioneerBenefitKeys = ['early', 'shape', 'community'] as const
const pioneerBenefitIcons = {
  early: 'i-carbon-play-filled',
  shape: 'i-carbon-flash-filled',
  community: 'i-carbon-user-multiple',
} as const

const langTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const signInRoute = computed(() => ({
  path: '/sign-in',
  query: {
    lang: langTag.value,
    redirect_url: '/updates?channel=beta',
  },
}))

const pioneer = computed(() => ({
  headline: t('landing.os.pioneer.headline'),
  subheadline: t('landing.os.pioneer.subheadline'),
  ctaPrimary: t('landing.os.pioneer.ctaPrimary'),
  benefits: pioneerBenefitKeys.map(key => ({
    key,
    icon: pioneerBenefitIcons[key],
    title: t(`landing.os.pioneer.benefits.${key}.title`),
    copy: t(`landing.os.pioneer.benefits.${key}.copy`),
  })),
}))

// Aurora bar configs — randomized but deterministic per render
const auroraBarCount = 28
const auroraBars = computed(() =>
  Array.from({ length: auroraBarCount }, (_, i) => ({
    id: i,
    x: `${Math.random() * 100}%`,
    width: `${Math.random() * 3 + 0.5}%`,
    delay: Math.random() * 8,
    duration: Math.random() * 6 + 4,
  })),
)

function goToSignIn() {
  router.push(signInRoute.value)
}
</script>

<template>
  <TuffLandingSection
    id="download"
    section-class="h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 48,
        duration: 1.05,
      },
    }"
  >
    <template #decoration>
      <!-- Aurora bars background -->
      <div class="pioneer-aurora pointer-events-none absolute inset-0 overflow-hidden opacity-35">
        <TuffLandingAuroraBar
          v-for="bar in auroraBars"
          :key="bar.id"
          :x="bar.x"
          :width="bar.width"
          :delay="bar.delay"
          :duration="bar.duration"
        />
      </div>
      <!-- Blur overlay to soften aurora -->
      <div class="pointer-events-none absolute inset-0 backdrop-blur-[80px]" />
      <!-- Glow orbs -->
      <div class="absolute left-[-220px] top-[30%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(147,51,234,0.14),_transparent_70%)] blur-3xl" />
      <div class="absolute bottom-[10%] right-[-200px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.12),_transparent_70%)] blur-3xl" />
    </template>

    <!-- Two-column layout -->
    <div class="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
      <!-- Left: headline + CTA -->
      <div class="flex flex-col gap-6">
        <h2 class="pioneer-headline text-[2.75rem] font-bold leading-[1.08] tracking-tight sm:text-[3.5rem]">
          {{ pioneer.headline }}
        </h2>

        <p class="max-w-md text-base text-white/55 leading-relaxed">
          {{ pioneer.subheadline }}
        </p>

        <div class="mt-2 flex items-center gap-3">
          <TxButton
            native-type="button"
            @click="goToSignIn"
          >
            <span class="i-carbon-arrow-right" />
            {{ pioneer.ctaPrimary }}
          </TxButton>
        </div>
      </div>

      <!-- Right: benefit cards -->
      <div class="flex flex-col gap-4" data-reveal>
        <article
          v-for="benefit in pioneer.benefits"
          :key="benefit.key"
          class="group flex items-start gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-5 backdrop-blur-sm transition duration-300 hover:border-white/[0.12] hover:bg-white/[0.04]"
        >
          <span class="size-10 mt-0.5 inline-flex flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/60">
            <span :class="benefit.icon" class="text-lg" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <h3 class="text-[15px] font-medium text-white/90">
              {{ benefit.title }}
            </h3>
            <p class="mt-1 text-sm text-white/45 leading-relaxed">
              {{ benefit.copy }}
            </p>
          </div>
        </article>
      </div>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.pioneer-headline {
  background: linear-gradient(
    135deg,
    #fff 0%,
    #e0c3fc 40%,
    #8ec5fc 60%,
    #fff 100%
  );
  background-size: 200% 200%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: pioneer-gradient-shift 6s ease-in-out infinite;
}

@keyframes pioneer-gradient-shift {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.pioneer-aurora {
  container-type: size;
}
</style>
