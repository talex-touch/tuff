<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, watch } from 'vue'
import NewLandingStats from './components/NewLandingStats.vue'
import NewNexusHero from './components/NewNexusHero.vue'
import { useTuffHomeSections } from '~/composables/useTuffHomeSections'

const TuffLandingPlugins = defineAsyncComponent(() => import('~/components/tuff/landing/TuffLandingPlugins.vue'))
const TuffLandingAiOverview = defineAsyncComponent(() => import('~/components/tuff/landing/TuffLandingAiOverview.vue'))
const TuffLandingInstantPreview = defineAsyncComponent(() => import('~/components/tuff/landing/TuffLandingInstantPreview.vue'))
const TuffLandingBuiltForYou = defineAsyncComponent(() => import('~/components/tuff/landing/TuffLandingBuiltForYou.vue'))
const TuffLandingFeatures = defineAsyncComponent(() => import('~/components/tuff/landing/TuffLandingFeatures.vue'))
const TuffLandingEcosystem = defineAsyncComponent(() => import('~/components/tuff/landing/TuffLandingEcosystem.vue'))
const TuffLandingIntegrations = defineAsyncComponent(() => import('~/components/tuff/landing/TuffLandingIntegrations.vue'))
const TuffLandingCommunity = defineAsyncComponent(() => import('~/components/tuff/landing/TuffLandingCommunity.vue'))
const TuffLandingFaq = defineAsyncComponent(() => import('~/components/tuff/landing/TuffLandingFaq.vue'))
const TuffLandingWaitlist = defineAsyncComponent(() => import('~/components/tuff/landing/TuffLandingWaitlist.vue'))

definePageMeta({
  layout: 'home',
})

const {
  smoothScrollContainerRef,
  statsSectionRef,
  pluginsSectionRef,
  aiOverviewSectionRef,
  instantPreviewSectionRef,
  builtForYouSectionRef,
  featuresSectionRef,
  ecosystemSectionRef,
  integrationsSectionRef,
  communitySectionRef,
  faqSectionRef,
  waitlistSectionRef,
} = useTuffHomeSections()

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
})

onBeforeUnmount(() => {
  stopDarkLock()
  if (colorMode.preference !== previousPreference)
    colorMode.preference = previousPreference
})

const pageTitle = computed(() => `Tuff Nexus`)

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
})

useHead({
  bodyAttrs: { class: 'bg-black text-light antialiased' },
})
</script>

<template>
  <div class="NewLanding relative min-h-screen flex flex-col bg-black text-light">
    <NewNexusHero />
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
        <NewLandingStats />
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
        <TuffLandingBuiltForYou />
      </section>

      <section
        id="features"
        ref="featuresSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingFeatures />
      </section>

      <section
        id="ecosystem"
        ref="ecosystemSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingEcosystem />
      </section>

      <section
        id="integrations"
        ref="integrationsSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingIntegrations />
      </section>

      <section
        id="community"
        ref="communitySectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingCommunity />
      </section>

      <section
        id="faq"
        ref="faqSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingFaq />
      </section>

      <section
        id="waitlist"
        ref="waitlistSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingWaitlist />
      </section>
    </div>
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

.NewLanding #stats {
  scroll-margin-top: 0;
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

<style>
@media (min-width: 769px) {
  .NewLanding #stats .TuffLandingSection-Container {
    max-width: none;
    width: 100%;
    padding-top: 0;
    padding-bottom: 0;
  }

  .NewLanding #stats .TuffLandingSection-Content,
  .NewLanding #stats .new-stats-body,
  .NewLanding #stats .new-stats-showcase {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .NewLanding #stats .TuffLandingSection-Content {
    display: grid;
    place-items: center;
  }

  .NewLanding #stats .new-stats-body {
    min-height: 0;
  }

  .NewLanding #stats .new-stats-showcase {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }

  .NewLanding #stats .new-stats-showcase-frame {
    position: relative;
  }
}
</style>
