<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { gsap } from 'gsap'
import { useGsapReveal } from '~/composables/useGsapReveal'
import CoreBoxMock from './ai/CoreBoxMock.vue'
import type { CoreBoxCommand } from './ai/CoreBoxMock.vue'

const { t } = useI18n()

const craftsmanship = computed(() => ({
  eyebrow: t('landing.os.craftsmanship.eyebrow'),
  headline: t('landing.os.craftsmanship.headline'),
  subheadline: t('landing.os.craftsmanship.subheadline'),
}))

const panelRef = ref<HTMLElement | null>(null)
const isExpanded = ref(false)
const coreboxWrapRef = ref<HTMLElement | null>(null)

let resultsTween: gsap.core.Tween | null = null

function handleHover(active: boolean) {
  if (active) {
    isExpanded.value = true
    nextTick(() => {
      const resultsEl = coreboxWrapRef.value?.querySelector<HTMLElement>('.corebox-mock__results')
      if (!resultsEl)
        return
      resultsTween?.kill()
      gsap.set(resultsEl, { autoAlpha: 0, y: -8, scaleY: 0.92, transformOrigin: 'top' })
      resultsTween = gsap.to(resultsEl, {
        autoAlpha: 1,
        y: 0,
        scaleY: 1,
        duration: 0.72,
        ease: 'expo.out',
        overwrite: 'auto',
      })
    })
    return
  }

  const resultsEl = coreboxWrapRef.value?.querySelector<HTMLElement>('.corebox-mock__results')
  if (!resultsEl) {
    isExpanded.value = false
    return
  }
  resultsTween?.kill()
  resultsTween = gsap.to(resultsEl, {
    autoAlpha: 0,
    y: -6,
    scaleY: 0.96,
    duration: 0.4,
    ease: 'expo.in',
    overwrite: 'auto',
    onComplete: () => {
      isExpanded.value = false
    },
  })
}

useGsapReveal(panelRef, {
  targetSelector: '.landing-integrations__footline',
  from: {
    opacity: 0,
    y: 24,
    scaleX: 0.6,
    duration: 0.9,
  },
  stagger: 0,
  scrollTrigger: {
    start: 'top 78%',
  },
})

const coreBoxCommandKeys = ['launch', 'search', 'clipboard', 'flows', 'ai'] as const
const coreBoxCommandIcons = {
  launch: 'i-carbon-launch',
  search: 'i-carbon-search',
  clipboard: 'i-carbon-copy',
  flows: 'i-carbon-flow',
  ai: 'i-carbon-bot',
} as const
const coreBoxCommandColors = {
  launch: '#60a5fa',
  search: '#f59e0b',
  clipboard: '#34d399',
  flows: '#a78bfa',
  ai: '#f472b6',
} as const

const coreBoxCommands = computed<CoreBoxCommand[]>(() =>
  coreBoxCommandKeys.map(key => ({
    id: key,
    label: t(`landing.os.corebox.commands.${key}.label`),
    description: t(`landing.os.corebox.commands.${key}.description`),
    icon: coreBoxCommandIcons[key],
    iconColor: coreBoxCommandColors[key],
  })),
)
</script>

<template>
  <TuffLandingSection
    :sticky="craftsmanship.eyebrow"
    :title="craftsmanship.headline"
    :subtitle="craftsmanship.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="w-full flex flex-col items-center gap-12"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 44,
        duration: 1,
      },
    }"
  >
    <div ref="panelRef" class="landing-integrations__panel" :class="{ 'is-expanded': isExpanded }">
      <div
        ref="coreboxWrapRef"
        class="landing-integrations__mock"
        @mouseenter="handleHover(true)"
        @mouseleave="handleHover(false)"
      >
        <div class="landing-integrations__corebox-stack">
          <CoreBoxMock
            class="landing-integrations__corebox"
            :commands="coreBoxCommands"
            input-text="Everything in tuff."
            placeholder="Everything in tuff."
            results-title="COREBOX"
            :show-results="isExpanded"
            :show-logo="true"
          />
          <div class="landing-integrations__rainbow" aria-hidden="true" />
        </div>
      </div>
      <div class="landing-integrations__footline">
        ALL IN
        <span class="landing-integrations__footline-one" data-text="ONE">ONE</span>
      </div>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.landing-integrations__panel {
  position: relative;
  display: grid;
  grid-template-rows: 1fr auto;
  align-items: center;
  justify-items: center;
  width: 100%;
  max-width: min(1100px, 100%);
  min-height: clamp(420px, 52vw, 580px);
  padding: clamp(3.5rem, 9vw, 7rem) 0 clamp(3.2rem, 9vw, 5rem);
  row-gap: clamp(1.4rem, 4vw, 2.6rem);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.25) 0%, rgba(15, 23, 42, 0) 60%);
  overflow: hidden;
}

.landing-integrations__mock {
  width: min(650px, 64vw);
  height: clamp(300px, 38vw, 400px);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  z-index: 1;
}

.landing-integrations__corebox-stack {
  position: relative;
  width: 100%;
  padding-bottom: clamp(16px, 2vw, 24px);
}

.landing-integrations__corebox {
  position: relative;
  z-index: 1;
  width: 100%;
  text-align: left;
  transform: scale(1.04);
  transform-origin: center;
}

.landing-integrations__corebox :deep(.results-fade-enter-active),
.landing-integrations__corebox :deep(.results-fade-leave-active) {
  transition: none;
}

.landing-integrations__corebox :deep(.corebox-mock) {
  border-radius: 24px;
}

.landing-integrations__corebox :deep(.corebox-mock__input) {
  padding: 0.65rem 0.9rem;
}

.landing-integrations__corebox :deep(.corebox-mock__logo) {
  width: 28px;
  height: 28px;
}

.landing-integrations__rainbow {
  --color-1: hsl(0 100% 63%);
  --color-2: hsl(270 100% 63%);
  --color-3: hsl(210 100% 63%);
  --color-4: hsl(195 100% 63%);
  --color-5: hsl(90 100% 63%);
  --speed: 3.2s;
  position: absolute;
  left: 4%;
  right: 4%;
  bottom: clamp(8px, 1.2vw, 12px);
  height: 4px;
  border-radius: 999px;
  background: transparent;
  opacity: 1;
  filter: none;
  transition: opacity 0.5s ease, transform 0.5s ease, filter 0.5s ease;
  z-index: 0;
  pointer-events: none;
}

.landing-integrations__rainbow::before {
  content: '';
  position: absolute;
  inset: -4px 2.5%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-1), var(--color-5), var(--color-3), var(--color-4), var(--color-2));
  background-size: 200%;
  opacity: 0.65;
  filter: blur(14px);
  transform: translateY(-10px);
  animation: landing-rainbow var(--speed) linear infinite;
}

.landing-integrations__panel.is-expanded .landing-integrations__rainbow {
  opacity: 0;
  transform: translateY(6px) scaleX(0.92);
  filter: blur(8px);
}

@keyframes landing-rainbow {
  0% {
    background-position: 0;
  }
  100% {
    background-position: 200%;
  }
}

.landing-integrations__corebox :deep(.corebox-mock__input-text) {
  text-align: left;
}

.landing-integrations__footline {
  position: relative;
  z-index: 1;
  font-size: clamp(2.2rem, 4.4vw, 4.4rem);
  font-weight: 700;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  text-align: center;
  color: rgba(226, 232, 240, 0.7);
  transform-origin: center;
  margin-top: clamp(0.6rem, 2vw, 1.4rem);
  will-change: transform, opacity;
}

.landing-integrations__footline-one {
  --shadow-color: rgba(226, 232, 240, 0.85);
  position: relative;
  display: inline-flex;
  z-index: 0;
  margin-left: 0.35em;
  filter: drop-shadow(0 6px 18px rgba(226, 232, 240, 0.2));
}

.landing-integrations__footline-one::after {
  content: attr(data-text);
  position: absolute;
  top: 0.04em;
  left: 0.04em;
  z-index: -1;
  background: linear-gradient(45deg, transparent 45%, var(--shadow-color) 45%, var(--shadow-color) 55%, transparent 0);
  background-size: 0.06em 0.06em;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: landing-line-shadow 15s linear infinite;
}

@keyframes landing-line-shadow {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 100% -100%;
  }
}

@media (max-width: 900px) {
  .landing-integrations__corebox {
    transform: scale(1);
  }

  .landing-integrations__footline {
    letter-spacing: 0.22em;
  }
}
</style>
