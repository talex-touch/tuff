<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TuffLandingNexusHero from './landing/TuffLandingNexusHero.vue'
import { useTuffHomeAdaptation } from '~/composables/useTuffHomeAdaptation'
import { useTuffHomeSections } from '~/composables/useTuffHomeSections'

const TuffLandingStats = defineAsyncComponent(() => import('./landing/TuffLandingStats.vue'))
const TuffLandingPlugins = defineAsyncComponent(() => import('./landing/TuffLandingPlugins.vue'))
const TuffLandingAiOverview = defineAsyncComponent(() => import('./landing/TuffLandingAiOverview.vue'))
const TuffLandingInstantPreview = defineAsyncComponent(() => import('./landing/TuffLandingInstantPreview.vue'))
const TuffLandingFeatureShowcase = defineAsyncComponent(() => import('./landing/TuffLandingFeatureShowcase.vue'))
const TuffLandingDesignSystem = defineAsyncComponent(() => import('./landing/TuffLandingDesignSystem.vue'))
const TuffLandingFaq = defineAsyncComponent(() => import('./landing/TuffLandingFaq.vue'))

const { enableSmoothScroll } = useTuffHomeAdaptation()

const {
  smoothScrollContainerRef,
  statsSectionRef,
  pluginsSectionRef,
  aiOverviewSectionRef,
  instantPreviewSectionRef,
  builtForYouSectionRef,
  ecosystemSectionRef,
  faqSectionRef,
} = useTuffHomeSections({
  enableSmoothScroll: enableSmoothScroll.value,
})

// ── Section rail ───────────────────────────────────────────────────────────
// A short mark per section on the right edge: the current one is long and lit,
// the label shows on hover, a click scrolls there (the snap then settles it).
// Hidden while the hero is on screen, and on phones.

const { t } = useI18n()

const RAIL = [
  { id: 'stats', label: 'landing.os.aiSpotlight.eyebrow' },
  { id: 'plugins', label: 'landing.os.plugins.eyebrow' },
  { id: 'ai-overview', label: 'landing.os.aiOverview.eyebrow' },
  { id: 'instant-preview', label: 'landing.os.instantPreview.eyebrow' },
  { id: 'built-for-you', label: 'landing.os.showcase.eyebrow' },
  { id: 'ecosystem', label: 'landing.os.designSystem.eyebrow' },
  { id: 'faq', label: 'landing.os.faq.eyebrow' },
] as const

const railItems = computed(() => RAIL.map(item => ({ id: item.id, label: t(item.label) })))
const activeSection = ref<string>('')
const railVisible = ref(false)
let sectionObserver: IntersectionObserver | null = null
let heroObserver: IntersectionObserver | null = null

function goToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function observeSections() {
  if (typeof IntersectionObserver === 'undefined')
    return
  sectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting)
        activeSection.value = (entry.target as HTMLElement).id
    }
  }, { threshold: 0.55 })
  for (const item of RAIL) {
    const el = document.getElementById(item.id)
    if (el)
      sectionObserver.observe(el)
  }
  const hero = document.querySelector('.ExpHero')
  if (hero) {
    heroObserver = new IntersectionObserver(([entry]) => {
      railVisible.value = !entry?.isIntersecting
    }, { threshold: 0.25 })
    heroObserver.observe(hero)
  }
}

const colorMode = useColorMode()
let previousPreference = colorMode.preference
const stopDarkLock = watch(() => colorMode.preference, (value) => {
  if (value !== 'dark')
    colorMode.preference = 'dark'
})

onMounted(() => {
  previousPreference = colorMode.preference
  if (colorMode.preference !== 'dark')
    colorMode.preference = 'dark'
  observeSections()
})

onBeforeUnmount(() => {
  sectionObserver?.disconnect()
  heroObserver?.disconnect()
  stopDarkLock()
  if (colorMode.preference !== previousPreference)
    colorMode.preference = previousPreference
})

useHead({
  bodyAttrs: { class: 'bg-black text-light antialiased' },
})
</script>

<template>
  <div class="relative min-h-screen flex flex-col bg-black text-light">
    <TuffLandingNexusHero />
    <div
      ref="smoothScrollContainerRef"
      class="TuffHome-SmoothSectionGroup"
    >
      <section
        id="stats"
        ref="statsSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingStats />
      </section>

      <section
        id="plugins"
        ref="pluginsSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingPlugins />
      </section>

      <section
        id="ai-overview"
        ref="aiOverviewSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingAiOverview />
      </section>

      <section
        id="instant-preview"
        ref="instantPreviewSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingInstantPreview />
      </section>

      <section
        id="built-for-you"
        ref="builtForYouSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingFeatureShowcase />
      </section>

      <section
        id="ecosystem"
        ref="ecosystemSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingDesignSystem />
      </section>

      <section
        id="faq"
        ref="faqSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingFaq />
      </section>
    </div>

    <nav
      class="TuffHome-Rail"
      :class="{ 'is-visible': railVisible }"
      :aria-label="t('landing.os.rail.label')"
    >
      <button
        v-for="item in railItems"
        :key="item.id"
        type="button"
        class="TuffHome-RailItem"
        :class="{ 'is-active': activeSection === item.id }"
        :aria-current="activeSection === item.id ? 'true' : undefined"
        @click="goToSection(item.id)"
      >
        <span class="TuffHome-RailLabel">{{ item.label }}</span>
        <span class="TuffHome-RailMark" aria-hidden="true" />
      </button>
    </nav>
  </div>
</template>

<style scoped>
.TuffHome-SmoothSectionGroup {
  position: relative;
  isolation: isolate;
}

.TuffHome-SmoothSection {
  position: relative;

  min-height: 100dvh;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  box-sizing: content-box;
}

.TuffHome-SmoothSection :deep(button) {
  border: none;
  outline: none;
}

/* Depth on scroll: each section's heading and content rise into place as the
   section comes in and settle back as it leaves, driven by the scroll itself.
   Only the heading and content move — the eyebrow pill beside them is
   position: fixed, and a transformed ancestor would carry it off.
   Both follow the section's own timeline, not their own: a heading near the
   top of the viewport would otherwise read as already leaving. A section is
   one viewport tall, so it sits at exactly 50% when snapped into place. */
@supports (animation-timeline: view()) {
  @media (min-width: 769px) and (prefers-reduced-motion: no-preference) {
    .TuffHome-SmoothSection {
      view-timeline: --tuff-section block;
    }

    .TuffHome-SmoothSection :deep(.TuffLandingSection-Container > header),
    .TuffHome-SmoothSection :deep(.TuffLandingSection-Content) {
      animation: tuff-home-depth linear both;
      animation-timeline: --tuff-section;
    }
  }
}

@keyframes tuff-home-depth {
  0% {
    opacity: 0;
    transform: translate3d(0, 9vh, 0) scale(0.95);
  }

  32%,
  68% {
    opacity: 1;
    transform: none;
  }

  100% {
    opacity: 0.2;
    transform: translate3d(0, -5vh, 0) scale(0.97);
  }
}

/* ── Section rail ─────────────────────────────────────────────────────── */
.TuffHome-Rail {
  position: fixed;
  top: 50%;
  right: clamp(0.75rem, 1.6vw, 1.5rem);
  z-index: 45;
  display: grid;
  gap: 0.35rem;
  transform: translate3d(12px, -50%, 0);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 360ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 460ms cubic-bezier(0.23, 1, 0.32, 1);
}

.TuffHome-Rail.is-visible {
  transform: translate3d(0, -50%, 0);
  opacity: 1;
  pointer-events: auto;
}

.TuffHome-RailItem {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  height: 1.25rem;
  padding: 0;
  border: 0;
  border-radius: 0;
  appearance: none;
  background: transparent;
  font: inherit;
  color: rgba(246, 247, 244, 0.7);
  cursor: pointer;
}

.TuffHome-RailMark {
  width: 0.75rem;
  height: 2px;
  border-radius: 2px;
  background: rgba(246, 247, 244, 0.26);
  transition:
    width 320ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 240ms ease;
}

.TuffHome-RailItem:hover .TuffHome-RailMark {
  width: 1.1rem;
  background: rgba(246, 247, 244, 0.6);
}

.TuffHome-RailItem.is-active .TuffHome-RailMark {
  width: 1.6rem;
  background: #f6f7f4;
}

/* Labels stay out of the way until the rail is hovered or focused. */
.TuffHome-RailLabel {
  font-size: 0.72rem;
  font-weight: 560;
  white-space: nowrap;
  opacity: 0;
  transform: translate3d(6px, 0, 0);
  transition:
    opacity 220ms ease,
    transform 320ms cubic-bezier(0.23, 1, 0.32, 1);
}

.TuffHome-Rail:hover .TuffHome-RailLabel,
.TuffHome-Rail:focus-within .TuffHome-RailLabel {
  opacity: 1;
  transform: none;
}

.TuffHome-RailItem.is-active .TuffHome-RailLabel {
  color: #f6f7f4;
}

.TuffHome-RailItem:focus-visible {
  outline: none;
}

.TuffHome-RailItem:focus-visible .TuffHome-RailMark {
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.8);
}

@media (max-width: 768px) {
  .TuffHome-Rail {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .TuffHome-Rail,
  .TuffHome-RailMark,
  .TuffHome-RailLabel {
    transition: none;
  }
}

@media (max-width: 768px) {
  .TuffHome-SmoothSection {
    min-height: 100svh;
    height: auto;
    max-height: none;
    overflow: visible;
  }
}
</style>
