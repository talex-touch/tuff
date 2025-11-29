<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

const builtForYouPersonaKeys = ['makers', 'developers', 'operators'] as const
const builtForYouPersonaIcons = {
  makers: 'i-carbon-pen',
  developers: 'i-carbon-code',
  operators: 'i-carbon-chart-combo',
} as const
const builtForYouPersonaAccents = {
  makers: 'bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_70%)]',
  developers: 'bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.2),_transparent_70%)]',
  operators: 'bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.2),_transparent_70%)]',
} as const

const builtForYouStatKeys = ['latency', 'adoption', 'satisfaction'] as const
const builtForYouStatIcons = {
  latency: 'i-carbon-flash-filled',
  adoption: 'i-carbon-user-multiple',
  satisfaction: 'i-carbon-face-satisfied',
} as const

const builtForYou = computed(() => ({
  eyebrow: t('landing.os.builtForYou.eyebrow'),
  headline: t('landing.os.builtForYou.headline'),
  subheadline: t('landing.os.builtForYou.subheadline'),
  personas: builtForYouPersonaKeys.map(key => ({
    id: key,
    icon: builtForYouPersonaIcons[key],
    accent: builtForYouPersonaAccents[key],
    title: t(`landing.os.builtForYou.personas.${key}.title`),
    copy: t(`landing.os.builtForYou.personas.${key}.copy`),
    quote: t(`landing.os.builtForYou.personas.${key}.quote`),
    name: t(`landing.os.builtForYou.personas.${key}.name`),
    role: t(`landing.os.builtForYou.personas.${key}.role`),
  })),
  stats: builtForYouStatKeys.map(key => ({
    id: key,
    icon: builtForYouStatIcons[key],
    label: t(`landing.os.builtForYou.stats.${key}.label`),
    value: t(`landing.os.builtForYou.stats.${key}.value`),
  })),
}))
</script>

<template>
  <TuffLandingSection
    :sticky="builtForYou.eyebrow"
    :title="builtForYou.headline"
    :subtitle="builtForYou.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full space-y-10"
    title-class="text-[clamp(.7rem,1vw+1.4rem,1.2rem)] font-bold leading-tight"
    subtitle-class="mx-auto my-0 max-w-3xl text-[clamp(.6rem,1vw+1.3rem,1.1rem)] font-semibold leading-relaxed op-70"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 34,
        duration: 1,
      },
    }"
  >
    <template #decoration>
      <div class="absolute inset-y-0 left-[-240px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(79,70,229,0.24),_transparent_70%)] blur-3xl" />
      <div class="absolute bottom-[-180px] right-[-220px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.22),_transparent_70%)] blur-3xl" />
    </template>

    <div class="grid gap-6 lg:grid-cols-3">
      <article
        v-for="persona in builtForYou.personas"
        :key="persona.id"
        data-reveal
        class="group relative h-full flex flex-col gap-6 overflow-hidden border border-white/12 rounded-[30px] bg-white/5 p-8 text-left text-white shadow-[0_28px_110px_rgba(10,18,52,0.36)] transition duration-300 hover:border-white/25 hover:bg-white/9 hover:-translate-y-1"
      >
        <div class="pointer-events-none absolute inset-0 opacity-80 transition duration-300 group-hover:opacity-100" :class="persona.accent" />
        <div class="relative space-y-5">
          <span class="size-12 inline-flex items-center justify-center rounded-2xl bg-white/15 text-white shadow-[0_18px_45px_rgba(5,16,48,0.4)]">
            <span :class="persona.icon" class="text-xl" aria-hidden="true" />
          </span>
          <div class="space-y-2">
            <h3 class="text-xl font-semibold leading-tight">
              {{ persona.title }}
            </h3>
            <p class="text-sm text-white/70 leading-relaxed">
              {{ persona.copy }}
            </p>
          </div>
          <blockquote class="border-l-2 border-white/20 pl-4 text-sm text-white/70 leading-relaxed italic">
            {{ persona.quote }}
          </blockquote>
          <footer class="text-sm text-white/60 space-y-1">
            <p class="text-white font-semibold">
              {{ persona.name }}
            </p>
            <p>
              {{ persona.role }}
            </p>
          </footer>
        </div>
      </article>
    </div>
  </TuffLandingSection>
</template>
