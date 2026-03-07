<script setup lang="ts">
import TuffLandingHero from './landing/TuffLandingHero.vue'
import TuffLandingStats from './landing/TuffLandingStats.vue'
import TuffLandingInstantPreview from './landing/TuffLandingInstantPreview.vue'

const showStarSnippets = false
const showAggregation = false
const showPricing = false

const vObserve = {
  mounted: (el: HTMLElement) => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )
    observer.observe(el)
  }
}

useHead({
  bodyAttrs: { class: 'text-black dark:text-light antialiased bg-white dark:bg-[#0a0a0a] transition-colors duration-300' },
})
</script>

<template>
  <div class="relative min-h-screen flex flex-col">
    <TuffLandingHero />
    
    <div class="flex flex-col w-full relative z-10 TuffHomeV2-Container">
      <section id="stats" v-observe class="TuffHomeV2-Section">
        <TuffLandingStats />
      </section>

      <section id="instant-preview" v-observe class="TuffHomeV2-Section">
        <TuffLandingInstantPreview />
      </section>

      <section id="ai-overview" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingAiOverview />
      </section>

      <section id="built-for-you" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingBuiltForYou />
      </section>

      <section v-if="showStarSnippets" id="star-snippets" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingStarSnippets />
      </section>

      <section v-if="showAggregation" id="aggregation" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingAggregation />
      </section>

      <section id="features" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingFeatures />
      </section>

      <section id="ecosystem" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingEcosystem />
      </section>

      <section id="integrations" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingIntegrations />
      </section>

      <section id="community" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingCommunity />
      </section>

      <section v-if="showPricing" id="pricing" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingPricing />
      </section>

      <section id="faq" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingFaq />
      </section>

      <section id="waitlist" v-observe class="TuffHomeV2-Section">
        <LazyTuffLandingWaitlist />
      </section>
    </div>
  </div>
</template>

<style scoped>
.TuffHomeV2-Container {
  overflow-x: hidden;
}

.TuffHomeV2-Section {
  position: relative;
  width: 100%;
  min-height: auto;
  padding: 4rem 0;
  box-sizing: border-box;
  opacity: 0;
  transform: translateY(40px);
  transition: opacity 0.8s cubic-bezier(0.22, 0.61, 0.36, 1), transform 0.8s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.TuffHomeV2-Section.is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (min-width: 768px) {
  .TuffHomeV2-Section {
    padding: 6rem 0;
  }
}
</style>
