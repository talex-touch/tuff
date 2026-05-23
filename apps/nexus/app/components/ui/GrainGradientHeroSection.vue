<script setup lang="ts">
defineOptions({ name: 'GrainGradientHeroSection' })

withDefaults(defineProps<{
  title: string
  subtitle: string
  ctaLabel: string
  eyebrow?: string
  ctaIcon?: string
}>(), {
  eyebrow: '',
  ctaIcon: 'i-carbon-arrow-right',
})

const emit = defineEmits<{
  cta: []
}>()
</script>

<template>
  <section class="grain-gradient-hero-section relative isolate min-h-[calc(100svh-32px)] overflow-hidden flex items-center justify-center px-6 py-28 text-center sm:px-8">
    <div class="grain-gradient-hero-section__gradient" aria-hidden="true" />
    <div class="grain-gradient-hero-section__grain" aria-hidden="true" />
    <div class="grain-gradient-hero-section__vignette" aria-hidden="true" />

    <div class="relative z-1 mx-auto max-w-4xl">
      <span v-if="eyebrow" class="grain-gradient-hero-section__eyebrow">
        {{ eyebrow }}
      </span>

      <h1 class="mt-6 text-balance text-4xl font-bold leading-[0.96] tracking-tight text-white sm:text-6xl lg:text-7xl">
        {{ title }}
      </h1>

      <p class="mx-auto mt-6 max-w-2xl text-pretty text-base leading-8 text-white/72 sm:text-xl">
        {{ subtitle }}
      </p>

      <div class="mt-9 flex justify-center">
        <TxButton
          variant="bare"
          size="lg"
          native-type="button"
          class="grain-gradient-hero-section__cta"
          @click="emit('cta')"
        >
          <span v-if="ctaIcon" :class="ctaIcon" class="text-lg" aria-hidden="true" />
          <span>{{ ctaLabel }}</span>
        </TxButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.grain-gradient-hero-section {
  background: #05050a;
}

.grain-gradient-hero-section__gradient {
  position: absolute;
  inset: -24%;
  z-index: -3;
  background:
    radial-gradient(circle at 18% 18%, rgba(255, 119, 198, 0.78) 0 12%, transparent 31%),
    radial-gradient(circle at 78% 18%, rgba(120, 119, 255, 0.74) 0 14%, transparent 35%),
    radial-gradient(circle at 54% 78%, rgba(48, 213, 200, 0.58) 0 12%, transparent 34%),
    radial-gradient(circle at 28% 68%, rgba(255, 181, 71, 0.48) 0 10%, transparent 33%),
    conic-gradient(from 210deg at 52% 46%, #080816, #3a135a, #116273, #f0a35d, #6421a7, #080816);
  filter: saturate(140%) contrast(108%);
  transform: translate3d(0, 0, 0) scale(1.02);
  animation: grain-gradient-hero-drift 18s ease-in-out infinite alternate;
}

.grain-gradient-hero-section__grain {
  position: absolute;
  inset: 0;
  z-index: -2;
  opacity: 0.34;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.78'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}

.grain-gradient-hero-section__vignette {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(circle at center, transparent 0 35%, rgba(5, 5, 10, 0.54) 72%, rgba(5, 5, 10, 0.88) 100%),
    linear-gradient(180deg, rgba(5, 5, 10, 0.18), rgba(5, 5, 10, 0.48) 76%, #05050a 100%);
}

.grain-gradient-hero-section__eyebrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  padding: 7px 14px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 24px 80px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.grain-gradient-hero-section__cta {
  min-width: 0 !important;
  border: 0 !important;
  border-radius: 999px !important;
  color: #05050a !important;
  --tx-button-bare-bg: rgba(255, 255, 255, 0.94);
  --tx-button-bare-hover: #fff;
  --tx-button-bare-padding: 12px 30px;
  --tx-button-bare-radius: 999px;
  --fake-color: rgba(255, 255, 255, 0.94);
  --fake-opacity: 1;
  --fake-inner-opacity: 1;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  font-size: 16px !important;
  font-weight: 700 !important;
  justify-content: center !important;
  transition: transform 0.24s ease, box-shadow 0.24s ease;
}

.grain-gradient-hero-section__cta:hover {
  --fake-color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

@keyframes grain-gradient-hero-drift {
  0% {
    transform: translate3d(-1.5%, -1%, 0) scale(1.04) rotate(0deg);
  }
  50% {
    transform: translate3d(1.5%, 1%, 0) scale(1.08) rotate(4deg);
  }
  100% {
    transform: translate3d(0.5%, -1.5%, 0) scale(1.05) rotate(-3deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .grain-gradient-hero-section__gradient {
    animation: none;
  }

  .grain-gradient-hero-section__cta,
  .grain-gradient-hero-section__cta:hover {
    transform: none;
  }
}
</style>
