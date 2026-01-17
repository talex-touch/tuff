<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { t } = useI18n()

const proactiveScenarioKeys = ['developer', 'designer', 'zero'] as const
const proactiveScenarioIcons = {
  developer: 'i-carbon-code',
  designer: 'i-carbon-brush-freehand',
  zero: 'i-carbon-sail-boat',
} as const

const proactive = computed(() => ({
  eyebrow: t('landing.os.proactive.eyebrow'),
  headline: t('landing.os.proactive.headline'),
  subheadline: t('landing.os.proactive.subheadline'),
  shieldLabel: t('landing.os.proactive.shieldLabel'),
  scenarios: proactiveScenarioKeys.map(key => ({
    id: key,
    icon: proactiveScenarioIcons[key],
    tab: t(`landing.os.proactive.scenarios.${key}.tab`),
    title: t(`landing.os.proactive.scenarios.${key}.title`),
    copy: t(`landing.os.proactive.scenarios.${key}.copy`),
    action: t(`landing.os.proactive.scenarios.${key}.action`),
  })),
}))

const activeScenarioId = ref('')

watch(
  () => proactive.value.scenarios,
  (scenarios) => {
    if (!scenarios.length) {
      activeScenarioId.value = ''
      return
    }

    if (!scenarios.some(item => item.id === activeScenarioId.value)) {
      activeScenarioId.value = scenarios[0]!.id
    }
  },
  { immediate: true },
)

const activeScenario = computed(() =>
  proactive.value.scenarios.find(item => item.id === activeScenarioId.value)
  ?? proactive.value.scenarios[0]
  ?? null,
)

function selectScenario(id: string) {
  activeScenarioId.value = id
}
</script>

<template>
  <TuffLandingSection
    :sticky="proactive.eyebrow"
    :title="proactive.headline"
    :subtitle="proactive.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full"
    header-class="py-6 text-white"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 50,
        duration: 1.1,
      },
    }"
  >
    <template #decoration>
      <div class="absolute inset-x-0 top-[-45%] h-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(94,122,255,0.25),_transparent_70%)] blur-3xl" />
      <div class="absolute bottom-[-30%] left-[10%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(15,208,186,0.22),_transparent_75%)] blur-3xl" />
    </template>

    <div
      data-reveal
      class="mx-auto max-w-3xl w-full flex flex-wrap items-center justify-center gap-3 border border-white/10 rounded-full bg-white/10 px-5 py-3 text-[11px] text-white/60 font-semibold tracking-[0.3em] uppercase shadow-[0_24px_80px_rgba(20,31,64,0.35)] backdrop-blur-lg"
    >
      <span class="inline-flex items-center gap-2 text-white">
        <span class="i-carbon-shield text-base text-[#7fd3ff]" />
        {{ proactive.shieldLabel }}
      </span>
    </div>

    <div class="grid mt-14 gap-10 lg:grid-cols-[0.9fr_1.1fr]">
      <nav data-reveal class="flex flex-wrap justify-center gap-4 lg:justify-start">
        <button
          v-for="scenario in proactive.scenarios"
          :key="scenario.id"
          type="button"
          class="w-44 flex flex-col items-center gap-3 border border-white/10 rounded-[24px] bg-white/10 px-5 py-5 text-center text-white/70 shadow-[0_22px_70px_rgba(10,18,44,0.28)] transition duration-300 sm:w-48 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          :class="scenario.id === activeScenarioId
            ? 'border-white/40 bg-white/20 text-white shadow-[0_28px_90px_rgba(15,29,74,0.6)]'
            : 'hover:-translate-y-1 hover:border-white/20 hover:bg-white/10'"
          @click="selectScenario(scenario.id)"
        >
          <span class="h-12 w-12 flex items-center justify-center border border-white/10 rounded-2xl bg-white/15 text-white shadow-[0_12px_30px_rgba(10,18,44,0.4)]">
            <span :class="scenario.icon" class="text-lg text-[#8cd3ff]" aria-hidden="true" />
          </span>
          <span class="text-sm font-semibold tracking-[0.28em] uppercase">
            {{ scenario.tab }}
          </span>
        </button>
      </nav>

      <article
        v-if="activeScenario"
        key="scenario-panel"
        data-reveal
        class="relative w-full overflow-hidden border border-white/10 rounded-[36px] bg-white/10 px-10 py-12 text-center text-white shadow-[0_32px_110px_rgba(10,18,44,0.45)] backdrop-blur-xl"
      >
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(100,176,255,0.2),_transparent_70%)] opacity-80" />
        <div class="space-y-5">
          <h3 class="text-2xl text-white font-semibold">
            {{ activeScenario.title }}
          </h3>
          <p class="text-sm text-white/70 leading-relaxed sm:text-base">
            {{ activeScenario.copy }}
          </p>
        </div>

        <div class="mt-10 flex justify-center">
          <span class="inline-flex items-center gap-2 border border-white/20 rounded-full bg-white/15 px-4 py-2 text-[11px] text-white/70 font-semibold tracking-[0.28em] uppercase">
            <span class="i-carbon-connection-signal text-base text-[#7fd4ff]" />
            {{ activeScenario.action }}
          </span>
        </div>
      </article>
    </div>
  </TuffLandingSection>
</template>
