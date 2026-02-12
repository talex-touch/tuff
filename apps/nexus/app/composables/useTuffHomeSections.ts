import { hasWindow } from '@talex-touch/utils/env'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'

type GsapTween = gsap.core.Tween

interface SectionDescriptor {
  id: string
  ref: Ref<HTMLElement | null>
}

interface UseTuffHomeSectionsOptions {
  enableSmoothScroll?: boolean
  heroSelector?: string
}

export function useTuffHomeSections(options: UseTuffHomeSectionsOptions = {}) {
  const enableSmoothScroll = options.enableSmoothScroll ?? false
  const heroSelector = options.heroSelector ?? '.TuffHome-HeroSection'

  const smoothScrollContainerRef = ref<HTMLElement | null>(null)
  const statsSectionRef = ref<HTMLElement | null>(null)
  const pluginsSectionRef = ref<HTMLElement | null>(null)
  const aiOverviewSectionRef = ref<HTMLElement | null>(null)
  const instantPreviewSectionRef = ref<HTMLElement | null>(null)
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

  const sectionDescriptors: SectionDescriptor[] = [
    { ref: statsSectionRef, id: 'stats' },
    { ref: pluginsSectionRef, id: 'plugins' },
    { ref: aiOverviewSectionRef, id: 'ai-overview' },
    { ref: instantPreviewSectionRef, id: 'instant-preview' },
    { ref: builtForYouSectionRef, id: 'built-for-you' },
    { ref: starSnippetsSectionRef, id: 'star-snippets' },
    { ref: aggregationSectionRef, id: 'aggregation' },
    { ref: featuresSectionRef, id: 'features' },
    { ref: ecosystemSectionRef, id: 'ecosystem' },
    { ref: experienceSectionRef, id: 'experience' },
    { ref: integrationsSectionRef, id: 'integrations' },
    { ref: communitySectionRef, id: 'community' },
    { ref: pricingSectionRef, id: 'pricing' },
    { ref: faqSectionRef, id: 'faq' },
    { ref: waitlistSectionRef, id: 'waitlist' },
    { ref: footerSectionRef, id: 'footer' },
  ]

  let smoothScrollTween: GsapTween | null = null
  let smoothScrollActive = false
  let smoothScrollPluginsRegistered = false
  let currentSectionIndex = -1
  let sectionElements: HTMLElement[] = []
  let sectionHashes: string[] = []
  let lastSectionHash = ''
  let scrollListener: (() => void) | null = null
  let resizeListener: (() => void) | null = null
  let heroSectionElement: HTMLElement | null = null
  let heroVisibleLast = true

  // Snap-after-scroll-idle state
  let snapTimer: ReturnType<typeof setTimeout> | null = null
  let userScrolling = false
  const SNAP_DELAY = 100 // ms after last scroll event to snap

  function collectSectionElements() {
    sectionElements = []
    sectionHashes = []
    sectionDescriptors.forEach((descriptor) => {
      const element = descriptor.ref.value
      if (!element)
        return
      if (!element.id)
        element.id = descriptor.id
      sectionElements.push(element)
      sectionHashes.push(descriptor.id)
    })
  }

  function updateSectionHash(hash: string) {
    if (!hasWindow())
      return
    const nextHash = hash ? `#${hash}` : ''
    if (lastSectionHash === nextHash)
      return
    lastSectionHash = nextHash
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`)
  }

  function getClosestSectionIndex() {
    if (!sectionElements.length)
      return 0

    let closest = 0
    let minDistance = Number.POSITIVE_INFINITY

    sectionElements.forEach((section, index) => {
      const rect = section.getBoundingClientRect()
      // Whichever section top is closest to viewport top = nearest page
      const distance = Math.abs(rect.top)

      if (distance < minDistance) {
        closest = index
        minDistance = distance
      }
    })

    return closest
  }

  function isInsideContainer() {
    const container = smoothScrollContainerRef.value
    if (!container)
      return false

    if (heroSectionElement) {
      const heroRect = heroSectionElement.getBoundingClientRect()
      if (heroRect.bottom > 0)
        return false
    }

    const rect = container.getBoundingClientRect()
    return rect.top < window.innerHeight && rect.bottom > 0
  }

  function refreshCurrentSectionIndex() {
    if (smoothScrollActive)
      return

    if (heroSectionElement) {
      const heroRect = heroSectionElement.getBoundingClientRect()
      const heroVisible = heroRect.bottom > 0

      if (heroVisible) {
        heroVisibleLast = true
        currentSectionIndex = -1
        updateSectionHash('')
        return
      }
    }

    heroVisibleLast = false
    currentSectionIndex = getClosestSectionIndex()
    const nextHash = sectionHashes[currentSectionIndex]
    if (nextHash)
      updateSectionHash(nextHash)
  }

  onMounted(async () => {
    await nextTick()

    if (!hasWindow())
      return

    heroSectionElement = document.querySelector<HTMLElement>(heroSelector)
    heroVisibleLast = heroSectionElement ? (heroSectionElement.getBoundingClientRect().bottom > 0) : true

    collectSectionElements()

    if (sectionElements.length === 0)
      return

    if (!enableSmoothScroll) {
      scrollListener = () => {
        collectSectionElements()
        refreshCurrentSectionIndex()
      }
      window.addEventListener('scroll', scrollListener, { passive: true })

      resizeListener = () => {
        heroSectionElement = document.querySelector<HTMLElement>(heroSelector)
        collectSectionElements()
        refreshCurrentSectionIndex()
      }
      window.addEventListener('resize', resizeListener)

      refreshCurrentSectionIndex()
      return
    }

    const container = smoothScrollContainerRef.value
    if (!container)
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

    const snapToClosest = () => {
      collectSectionElements()

      if (!sectionElements.length)
        return
      if (!isInsideContainer())
        return

      const closestIndex = getClosestSectionIndex()
      const target = sectionElements[closestIndex]
      if (!target)
        return

      // Only snap if the section isn't already roughly aligned
      const rect = target.getBoundingClientRect()
      if (Math.abs(rect.top) < 8) {
        currentSectionIndex = closestIndex
        const hash = sectionHashes[closestIndex]
        if (hash)
          updateSectionHash(hash)
        return
      }

      // Dynamic duration based on travel distance
      const distance = Math.abs(rect.top)
      const vh = window.innerHeight
      // Small nudge (~0.45s) → full page (~0.75s) → multi-page (~1.1s)
      const duration = Math.min(1.1, Math.max(0.45, 0.45 + (distance / vh) * 0.5))

      currentSectionIndex = closestIndex
      userScrolling = false // Reset before animation so GSAP scroll events aren't treated as user input
      smoothScrollTween?.kill()
      smoothScrollActive = true
      smoothScrollTween = gsap.to(window, {
        scrollTo: {
          y: target,
          offsetY: 0,
        },
        duration,
        ease: 'back.out(1.1)',
        autoKill: false,
        overwrite: 'auto',
        onComplete: () => {
          const hash = sectionHashes[closestIndex]
          if (hash)
            updateSectionHash(hash)
          releaseScrollTween()
        },
        onInterrupt: releaseScrollTween,
      })
    }

    const cancelSnap = () => {
      if (snapTimer) {
        clearTimeout(snapTimer)
        snapTimer = null
      }
    }

    const scheduleSnap = () => {
      cancelSnap()
      snapTimer = setTimeout(() => {
        snapTimer = null
        snapToClosest()
      }, SNAP_DELAY)
    }

    // User-initiated scroll: cancel any active snap animation and reschedule
    const onUserScroll = () => {
      userScrolling = true
      if (smoothScrollActive) {
        smoothScrollTween?.kill()
        releaseScrollTween()
      }
      cancelSnap()
    }

    // Passive scroll listener — never blocks native scrolling
    scrollListener = () => {
      collectSectionElements()
      refreshCurrentSectionIndex()

      // Only schedule snap when NOT animating — GSAP scroll events must not retrigger
      if (!smoothScrollActive && isInsideContainer()) {
        scheduleSnap()
      }
    }

    window.addEventListener('wheel', onUserScroll, { passive: true })
    window.addEventListener('touchstart', onUserScroll, { passive: true })
    window.addEventListener('scroll', scrollListener, { passive: true })

    resizeListener = () => {
      heroSectionElement = document.querySelector<HTMLElement>(heroSelector)
      collectSectionElements()
      refreshCurrentSectionIndex()
    }
    window.addEventListener('resize', resizeListener)

    refreshCurrentSectionIndex()

    // Store references for cleanup
    const _wheelHandler = onUserScroll
    const _touchHandler = onUserScroll

    onBeforeUnmount(() => {
      window.removeEventListener('wheel', _wheelHandler)
      window.removeEventListener('touchstart', _touchHandler)
      if (scrollListener)
        window.removeEventListener('scroll', scrollListener)
      if (resizeListener)
        window.removeEventListener('resize', resizeListener)

      scrollListener = null
      resizeListener = null
      sectionElements = []
      currentSectionIndex = -1
      heroSectionElement = null
      heroVisibleLast = true

      cancelSnap()

      smoothScrollTween?.kill()
      smoothScrollTween = null
      smoothScrollActive = false
    })
  })

  // Fallback cleanup for non-smooth-scroll mode
  onBeforeUnmount(() => {
    if (scrollListener)
      window.removeEventListener('scroll', scrollListener)
    if (resizeListener)
      window.removeEventListener('resize', resizeListener)
  })

  return {
    smoothScrollContainerRef,
    statsSectionRef,
    pluginsSectionRef,
    aiOverviewSectionRef,
    instantPreviewSectionRef,
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
  }
}
