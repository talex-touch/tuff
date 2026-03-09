<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import TuffLandingAiOverview from './landing/TuffLandingAiOverview.vue'
import TuffLandingBuiltForYou from './landing/TuffLandingBuiltForYou.vue'
import TuffLandingCommunity from './landing/TuffLandingCommunity.vue'
import TuffLandingEcosystem from './landing/TuffLandingEcosystem.vue'
import TuffLandingFaq from './landing/TuffLandingFaq.vue'
import TuffLandingFeatures from './landing/TuffLandingFeatures.vue'
import TuffLandingHero from './landing/TuffLandingHero.vue'
import TuffLandingIntegrations from './landing/TuffLandingIntegrations.vue'
import TuffLandingInstantPreview from './landing/TuffLandingInstantPreview.vue'
import TuffLandingPlugins from './landing/TuffLandingPlugins.vue'
import TuffLandingStats from './landing/TuffLandingStats.vue'
import TuffLandingWaitlist from './landing/TuffLandingWaitlist.vue'
import { useTuffHomeAdaptation } from '~/composables/useTuffHomeAdaptation'
import { useTuffHomeSections } from '~/composables/useTuffHomeSections'

const { enableSmoothScroll } = useTuffHomeAdaptation()

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
} = useTuffHomeSections({
  enableSmoothScroll: enableSmoothScroll.value,
})

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

useHead({
  bodyAttrs: { class: 'text-light antialiased' },
})
</script>

<template>
  <div class="relative min-h-screen flex flex-col text-light">
    <TuffLandingHero />
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

@media (max-width: 768px) {
  .TuffHome-SmoothSection {
    min-height: 100svh;
    height: auto;
    max-height: none;
    overflow: visible;
  }
}
</style>
