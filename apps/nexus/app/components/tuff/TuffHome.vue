<script setup lang="ts">
import TuffLandingAggregation from './landing/TuffLandingAggregation.vue'
import TuffLandingAiOverview from './landing/TuffLandingAiOverview.vue'
import TuffLandingBuiltForYou from './landing/TuffLandingBuiltForYou.vue'
import TuffLandingCommunity from './landing/TuffLandingCommunity.vue'
import TuffLandingEcosystem from './landing/TuffLandingEcosystem.vue'
import TuffLandingFaq from './landing/TuffLandingFaq.vue'
import TuffLandingFeatures from './landing/TuffLandingFeatures.vue'
import TuffLandingHero from './landing/TuffLandingHero.vue'
import TuffLandingIntegrations from './landing/TuffLandingIntegrations.vue'
import TuffLandingPlugins from './landing/TuffLandingPlugins.vue'
import TuffLandingPricing from './landing/TuffLandingPricing.vue'
import TuffLandingStarSnippets from './landing/TuffLandingStarSnippets.vue'
import TuffLandingStats from './landing/TuffLandingStats.vue'
import TuffLandingWaitlist from './landing/TuffLandingWaitlist.vue'
import { useTuffHomeSections } from '~/composables/useTuffHomeSections'

const showStarSnippets = false
const showAggregation = false
const showPricing = false
const enableSmoothScroll = false

const {
  smoothScrollContainerRef,
  statsSectionRef,
  pluginsSectionRef,
  aiOverviewSectionRef,
  builtForYouSectionRef,
  starSnippetsSectionRef,
  aggregationSectionRef,
  featuresSectionRef,
  ecosystemSectionRef,
  integrationsSectionRef,
  communitySectionRef,
  pricingSectionRef,
  faqSectionRef,
  waitlistSectionRef,
} = useTuffHomeSections({
  enableSmoothScroll,
})

useHead({
  htmlAttrs: { class: 'dark' },
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
        id="built-for-you"
        ref="builtForYouSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingBuiltForYou />
      </section>

      <section
        v-if="showStarSnippets"
        id="star-snippets"
        ref="starSnippetsSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingStarSnippets />
      </section>

      <section
        v-if="showAggregation"
        id="aggregation"
        ref="aggregationSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingAggregation />
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

      <!-- <section
        ref="experienceSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingExperience />
      </section> -->

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
        v-if="showPricing"
        id="pricing"
        ref="pricingSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingPricing />
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
</style>
