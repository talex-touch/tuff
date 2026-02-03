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
const builtForYouPersonaGlows = {
  makers: 'rgba(251, 191, 36, 0.22)',
  developers: 'rgba(59, 130, 246, 0.22)',
  operators: 'rgba(52, 211, 153, 0.22)',
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
    glow: builtForYouPersonaGlows[key],
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
      <TuffLandingTetrisBackground
        class="absolute left-1/2 top-[46%] inset-0 z-10 -translate-x-1/2 -translate-y-1/2 opacity-60 mix-blend-screen"
        square-color="#00C16A"
        :base="45"
      />
      <div class="tuff-persona-decoration tuff-persona-decoration--left" />
      <div class="tuff-persona-decoration tuff-persona-decoration--right" />
    </template>

    <div
      class="tuff-persona-grid grid gap-6 lg:grid-cols-3"
    >
      <article
        v-for="persona in builtForYou.personas"
        :key="persona.id"
        data-reveal
        class="group tuff-persona-card relative h-full flex flex-col gap-6 overflow-hidden p-8 text-left text-white transition duration-300"
        :style="{ '--glow-color': persona.glow }"
      >
        <span class="tuff-persona-card__bg-icon" :class="persona.icon" aria-hidden="true" />
        <div class="pointer-events-none absolute inset-0 opacity-50" :class="persona.accent" />
        <div class="tuff-persona-card__content relative space-y-4">
          <div class="space-y-2">
            <h3 class="text-xl font-semibold leading-tight">
              {{ persona.title }}
            </h3>
            <p class="text-sm text-white/70 leading-relaxed">
              {{ persona.copy }}
            </p>
          </div>
          <blockquote class="tuff-persona-quote text-sm leading-relaxed">
            <span class="tuff-persona-quote__mark" aria-hidden="true">“</span>
            <span class="tuff-persona-quote__text">
              {{ persona.quote }}
            </span>
          </blockquote>
          <footer class="text-sm text-white/60 space-y-0.5 leading-tight">
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

<style scoped>
.tuff-persona-grid {
  position: relative;
}

.tuff-persona-card {
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.02) 55%, var(--glow-color, rgba(255, 255, 255, 0.18)) 100%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 14px 48px rgba(8, 12, 30, 0.3);
  backdrop-filter: blur(6px) saturate(115%);
  -webkit-backdrop-filter: blur(6px) saturate(115%);
  transition: border-color 0.3s ease;
}

.tuff-persona-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(120% 80% at 50% 110%, var(--glow-color, rgba(255, 255, 255, 0.24)), transparent 65%);
  opacity: 1;
  pointer-events: none;
}

.tuff-persona-card:hover {
  border-color: rgba(255, 255, 255, 0.28);
}

.tuff-persona-card__bg-icon {
  position: absolute;
  right: -10px;
  bottom: -14px;
  display: block;
  font-size: 120px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.35);
  opacity: 0.12;
  filter: blur(0.2px);
  pointer-events: none;
  z-index: 0;
}

.tuff-persona-card__content {
  position: relative;
  z-index: 1;
}

.tuff-persona-quote {
  position: relative;
  width: 100%;
  align-self: stretch;
  padding: 0.95rem 1.1rem;
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.78);
  font-style: italic;
}

.tuff-persona-quote__mark {
  position: absolute;
  top: -0.35rem;
  left: 0.6rem;
  font-size: 2.2rem;
  color: rgba(255, 255, 255, 0.2);
  line-height: 1;
  pointer-events: none;
}

.tuff-persona-quote__text {
  display: block;
  position: relative;
  z-index: 1;
}

.tuff-persona-decoration {
  position: absolute;
  width: 120px;
  height: 120px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 18px rgba(255, 255, 255, 0.12);
  opacity: 0.35;
  pointer-events: none;
}

.tuff-persona-decoration--left {
  left: 6%;
  top: 20%;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.18), transparent 55%);
}

.tuff-persona-decoration--right {
  right: 8%;
  bottom: 18%;
  background:
    radial-gradient(circle at 70% 70%, rgba(255, 255, 255, 0.16), transparent 55%);
}
</style>
