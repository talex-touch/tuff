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

  function refreshCurrentSectionIndex() {
    if (smoothScrollActive)
      return

    if (heroSectionElement) {
      const heroRect = heroSectionElement.getBoundingClientRect()
      const heroVisible = heroRect.bottom > 0

      if (heroVisible) {
        heroVisibleLast = true
        heroJustExited = false
        currentSectionIndex = -1
        updateSectionHash('')
        return
      }

      if (heroVisibleLast && !heroVisible) {
        heroVisibleLast = false
        heroJustExited = true
        currentSectionIndex = -1
        updateSectionHash('')
        return
      }
    }

    if (heroJustExited) {
      currentSectionIndex = -1
      updateSectionHash('')
      return
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
    heroJustExited = false

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

    const clampIndex = (index: number) => {
      if (!sectionElements.length)
        return 0
      const maxIndex = sectionElements.length - 1
      return Math.min(Math.max(index, 0), maxIndex)
    }

    const scrollToSection = (section: HTMLElement, hash?: string) => {
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
        onComplete: () => {
          releaseScrollTween()
          if (hash)
            updateSectionHash(hash)
        },
        onInterrupt: releaseScrollTween,
      })
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
          const target = sectionElements[currentSectionIndex]
          if (!target)
            return false
          scrollToSection(target, sectionHashes[currentSectionIndex])
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
      const target = sectionElements[targetIndex]
      if (!target)
        return false
      scrollToSection(target, sectionHashes[targetIndex])
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
      heroSectionElement = document.querySelector<HTMLElement>(heroSelector)
      collectSectionElements()
      refreshCurrentSectionIndex()
    }

    window.addEventListener('resize', resizeListener)

    refreshCurrentSectionIndex()
  })

  onBeforeUnmount(() => {
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

  return {
    smoothScrollContainerRef,
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
  }
}
