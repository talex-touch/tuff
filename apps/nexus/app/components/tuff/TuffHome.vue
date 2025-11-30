<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import TuffLandingAggregation from './landing/TuffLandingAggregation.vue'
import TuffLandingAiOverview from './landing/TuffLandingAiOverview.vue'
import TuffLandingBuiltForYou from './landing/TuffLandingBuiltForYou.vue'
import TuffLandingCommunity from './landing/TuffLandingCommunity.vue'
import TuffLandingEcosystem from './landing/TuffLandingEcosystem.vue'
import TuffLandingExperience from './landing/TuffLandingExperience.vue'
import TuffLandingFaq from './landing/TuffLandingFaq.vue'
import TuffLandingFeatures from './landing/TuffLandingFeatures.vue'
import TuffLandingHero from './landing/TuffLandingHero.vue'
import TuffLandingIntegrations from './landing/TuffLandingIntegrations.vue'
import TuffLandingPlugins from './landing/TuffLandingPlugins.vue'
import TuffLandingPricing from './landing/TuffLandingPricing.vue'
import TuffLandingStarSnippets from './landing/TuffLandingStarSnippets.vue'
import TuffLandingStats from './landing/TuffLandingStats.vue'
import TuffLandingWaitlist from './landing/TuffLandingWaitlist.vue'

type GsapTween = import('gsap').gsap.core.Tween

const showStarSnippets = false
const showAggregation = false
const showPricing = false
const enableSmoothScroll = false

const smoothScrollContainerRef = ref<HTMLElement | null>(null)
const statsSectionRef = ref<HTMLElement | null>(null)
const pluginsSectionRef = ref<HTMLElement | null>(null)
const aiOverviewSectionRef = ref<HTMLElement | null>(null)
const builtForYouSectionRef = ref<HTMLElement | null>(null)
const starSnippetsSectionRef = ref<HTMLElement | null>(null)
const aggregationSectionRef = ref<HTMLElement | null>(null)
const featuresSectionRef = ref<HTMLElement | null>(null)
const ecosystemSectionRef = ref<HTMLElement | null>(null)
const experienceSectionRef = ref<HTMLElement | null>(null)
const integrationsSectionRef = ref<HTMLElement | null>(null)
const communitySectionRef = ref<HTMLElement | null>(null)
const pricingSectionRef = ref<HTMLElement | null>(null)
const faqSectionRef = ref<HTMLElement | null>(null)
const waitlistSectionRef = ref<HTMLElement | null>(null)
const footerSectionRef = ref<HTMLElement | null>(null)

const smoothSectionRefs = [
  statsSectionRef,
  pluginsSectionRef,
  aiOverviewSectionRef,
  builtForYouSectionRef,
  starSnippetsSectionRef,
  aggregationSectionRef,
  featuresSectionRef,
  ecosystemSectionRef,
  experienceSectionRef,
  integrationsSectionRef,
  communitySectionRef,
  pricingSectionRef,
  faqSectionRef,
  waitlistSectionRef,
  footerSectionRef,
] as const

let smoothScrollTween: GsapTween | null = null
let smoothScrollActive = false
let smoothScrollPluginsRegistered = false
let currentSectionIndex = -1
let sectionElements: HTMLElement[] = []
let wheelListener: ((event: WheelEvent) => void) | null = null
let scrollListener: (() => void) | null = null
let touchStartY = 0
let touchMoveHandled = false
let touchStartListener: ((event: TouchEvent) => void) | null = null
let touchMoveListener: ((event: TouchEvent) => void) | null = null
let resizeListener: (() => void) | null = null
let heroSectionElement: HTMLElement | null = null
let heroVisibleLast = true
let heroJustExited = false

function collectSectionElements() {
  sectionElements = smoothSectionRefs
    .map(sectionRef => sectionRef.value)
    .filter((element): element is HTMLElement => element !== null)
}

useHead({
  htmlAttrs: { class: 'dark' },
  bodyAttrs: { class: 'text-light antialiased' },
})

onMounted(async () => {
  if (!enableSmoothScroll)
    return

  await nextTick()

  if (typeof window === 'undefined')
    return

  const container = smoothScrollContainerRef.value
  if (!container)
    return

  heroSectionElement = document.querySelector<HTMLElement>('.TuffHome-HeroSection')
  heroVisibleLast = heroSectionElement ? (heroSectionElement.getBoundingClientRect().bottom > 0) : true
  heroJustExited = false

  collectSectionElements()

  if (sectionElements.length === 0)
    return

  const [{ gsap }, { ScrollToPlugin }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollToPlugin'),
  ])

  if (!smoothScrollPluginsRegistered) {
    gsap.registerPlugin(ScrollToPlugin)
    smoothScrollPluginsRegistered = true
  }

  const releaseScrollTween = () => {
    smoothScrollActive = false
    smoothScrollTween = null
  }

  const clampIndex = (index: number) => {
    if (!sectionElements.length)
      return 0
    const maxIndex = sectionElements.length - 1
    return Math.min(Math.max(index, 0), maxIndex)
  }

  const scrollToSection = (section: HTMLElement) => {
    smoothScrollTween?.kill()
    smoothScrollActive = true
    smoothScrollTween = gsap.to(window, {
      scrollTo: {
        y: section,
        offsetY: 0,
      },
      duration: 1.12,
      ease: 'power3.out',
      autoKill: false,
      overwrite: 'auto',
      onComplete: releaseScrollTween,
      onInterrupt: releaseScrollTween,
    })
  }

  const getClosestSectionIndex = () => {
    if (!sectionElements.length)
      return 0

    let closest = 0
    let minDistance = Number.POSITIVE_INFINITY
    const viewportMiddle = window.innerHeight / 2

    sectionElements.forEach((section, index) => {
      const rect = section.getBoundingClientRect()
      const distance = Math.abs(rect.top - viewportMiddle)

      if (distance < minDistance) {
        closest = index
        minDistance = distance
      }
    })

    return closest
  }

  const refreshCurrentSectionIndex = () => {
    if (smoothScrollActive)
      return

    if (heroSectionElement) {
      const heroRect = heroSectionElement.getBoundingClientRect()
      const heroVisible = heroRect.bottom > 0

      if (heroVisible) {
        heroVisibleLast = true
        heroJustExited = false
        currentSectionIndex = -1
        return
      }

      if (heroVisibleLast && !heroVisible) {
        heroVisibleLast = false
        heroJustExited = true
        currentSectionIndex = -1
        return
      }
    }

    if (heroJustExited) {
      currentSectionIndex = -1
      return
    }

    heroVisibleLast = false
    currentSectionIndex = getClosestSectionIndex()
  }

  const shouldControlScroll = (eventTarget: EventTarget | null) => {
    const activeContainer = smoothScrollContainerRef.value

    if (!activeContainer)
      return false

    collectSectionElements()

    if (!sectionElements.length)
      return false

    if (heroSectionElement) {
      const heroRect = heroSectionElement.getBoundingClientRect()
      if (heroRect.bottom > 0)
        return false
    }

    const rect = activeContainer.getBoundingClientRect()
    const containerVisible = rect.top < window.innerHeight && rect.bottom > 0

    if (!containerVisible)
      return false

    refreshCurrentSectionIndex()

    if (eventTarget && activeContainer.contains(eventTarget as Node))
      return true

    const scrollTop = window.scrollY
    const containerTop = activeContainer.offsetTop
    const containerBottom = containerTop + activeContainer.offsetHeight

    return scrollTop >= containerTop - 120 && scrollTop < containerBottom
  }

  const attemptSectionStep = (direction: 1 | -1) => {
    if (smoothScrollActive)
      return false
    if (!sectionElements.length)
      return false

    if (currentSectionIndex < 0) {
      if (direction > 0) {
        heroJustExited = false
        currentSectionIndex = clampIndex(0)
        scrollToSection(sectionElements[currentSectionIndex])
        return true
      }

      return false
    }

    if (direction > 0 && currentSectionIndex >= sectionElements.length - 1)
      return false

    if (direction < 0 && currentSectionIndex === 0) {
      const firstRect = sectionElements[0]?.getBoundingClientRect()
      if (!firstRect || firstRect.top >= 0) {
        currentSectionIndex = -1
        heroJustExited = false
        return false
      }
    }

    const targetIndex = clampIndex(currentSectionIndex + direction)

    if (targetIndex === currentSectionIndex)
      return false

    currentSectionIndex = targetIndex
    scrollToSection(sectionElements[targetIndex])
    heroJustExited = false
    return true
  }

  wheelListener = (event: WheelEvent) => {
    if (!shouldControlScroll(event.target))
      return

    if (smoothScrollActive) {
      event.preventDefault()
      return
    }

    const direction = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0
    if (direction === 0)
      return

    const moved = attemptSectionStep(direction as 1 | -1)
    if (moved)
      event.preventDefault()
  }

  touchStartListener = (event: TouchEvent) => {
    if (!shouldControlScroll(event.target))
      return

    touchMoveHandled = false
    touchStartY = event.touches[0]?.clientY ?? 0
  }

  touchMoveListener = (event: TouchEvent) => {
    if (!shouldControlScroll(event.target))
      return

    if (smoothScrollActive) {
      event.preventDefault()
      return
    }

    if (touchMoveHandled)
      return

    const currentY = event.touches[0]?.clientY ?? touchStartY
    const deltaY = touchStartY - currentY

    if (Math.abs(deltaY) < 40)
      return

    const direction = deltaY > 0 ? 1 : -1
    const moved = attemptSectionStep(direction as 1 | -1)

    if (moved) {
      touchMoveHandled = true
      event.preventDefault()
    }
  }

  scrollListener = () => {
    collectSectionElements()
    refreshCurrentSectionIndex()
  }

  window.addEventListener('wheel', wheelListener, { passive: false })
  window.addEventListener('touchstart', touchStartListener, { passive: true })
  window.addEventListener('touchmove', touchMoveListener, { passive: false })
  window.addEventListener('scroll', scrollListener, { passive: true })

  resizeListener = () => {
    heroSectionElement = document.querySelector<HTMLElement>('.TuffHome-HeroSection')
    collectSectionElements()
    refreshCurrentSectionIndex()
  }

  window.addEventListener('resize', resizeListener)

  refreshCurrentSectionIndex()
})

onBeforeUnmount(() => {
  if (!enableSmoothScroll)
    return

  if (wheelListener)
    window.removeEventListener('wheel', wheelListener)
  if (touchStartListener)
    window.removeEventListener('touchstart', touchStartListener)
  if (touchMoveListener)
    window.removeEventListener('touchmove', touchMoveListener)
  if (scrollListener)
    window.removeEventListener('scroll', scrollListener)
  if (resizeListener)
    window.removeEventListener('resize', resizeListener)

  wheelListener = null
  touchStartListener = null
  touchMoveListener = null
  scrollListener = null
  resizeListener = null
  sectionElements = []
  currentSectionIndex = -1
  heroSectionElement = null
  heroVisibleLast = true
  heroJustExited = false

  smoothScrollTween?.kill()
  smoothScrollTween = null

  smoothScrollActive = false
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
        ref="statsSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingStats />
      </section>

      <section
        ref="pluginsSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingPlugins />
      </section>

      <section
        ref="aiOverviewSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingAiOverview />
      </section>

      <section
        ref="builtForYouSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingBuiltForYou />
      </section>

      <section
        v-if="showStarSnippets"
        ref="starSnippetsSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingStarSnippets />
      </section>

      <section
        v-if="showAggregation"
        ref="aggregationSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingAggregation />
      </section>

      <section
        ref="featuresSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingFeatures />
      </section>

      <section
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
        ref="integrationsSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingIntegrations />
      </section>

      <section
        ref="communitySectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingCommunity />
      </section>

      <section
        v-if="showPricing"
        ref="pricingSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingPricing />
      </section>

      <section
        ref="faqSectionRef"
        class="TuffHome-SmoothSection"
        data-smooth-section
      >
        <TuffLandingFaq />
      </section>

      <section
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
}
</style>
