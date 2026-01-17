import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

type ScrollTriggerClass = typeof import('gsap/ScrollTrigger')['ScrollTrigger']
type ScrollTriggerInstance = InstanceType<ScrollTriggerClass>
type TimelineWithScrollTrigger = GSAPTimeline & { scrollTrigger?: ScrollTriggerInstance | null }

export interface UseTuffHeroAnimationOptions {
  /**
   * 当滚动进度达到该值时，顶部 Header 开始显现。
   * 取值范围 0~1，默认 0.45。
   */
  headerAppearThreshold?: number
  /**
   * 当滚动进度达到该值时，英雄区以外的主体内容开始回归正常布局。
   * 取值范围 0~1，默认 0.75。
   */
  paddingRevealThreshold?: number
}

interface InternalState {
  gsapInstance: GSAP | null
  ScrollTriggerPlugin: ScrollTriggerClass | null
  heroTimeline: TimelineWithScrollTrigger | null
  resizeRaf: number | null
  isBuilding: boolean
  headerElement: HTMLElement | null
  bodyOriginalBackground: string | null
  bodyFinalBackground: string | null
  hasBannerInitialReveal: boolean
  followingElements: HTMLElement[]
}

/**
 * 封装首页 WebGL 英雄区的滚动动画逻辑。
 * 返回 heroSection 引用，供组件直接绑定到 <section ref="heroSection">。
 */
export function useTuffHeroAnimation(options: UseTuffHeroAnimationOptions = {}) {
  const {
    headerAppearThreshold = 0.45,
    paddingRevealThreshold = 0.75,
  } = options

  // 英雄区根节点引用
  const heroSection = ref<HTMLElement | null>(null)

  const state: InternalState = {
    gsapInstance: null,
    ScrollTriggerPlugin: null,
    heroTimeline: null,
    resizeRaf: null,
    isBuilding: false,
    headerElement: null,
    bodyOriginalBackground: null,
    bodyFinalBackground: null,
    hasBannerInitialReveal: false,
    followingElements: [],
  }

  const resolveBodyTargetBackground = () => {
    if (!hasDocument())
      return '#181818'
    const root = document.documentElement
    const prefersDark = root.classList.contains('dark')
    return prefersDark ? '#181818' : '#aaaaaa'
  }

  const applyHeroState = (value: 'expanded' | 'animating' | 'compact' | 'measuring') => {
    if (!heroSection.value)
      return
    heroSection.value.dataset.state = value
  }

  const measureCompactHeight = (element: HTMLElement) => {
    const previousState = element.dataset.state || 'expanded'
    element.dataset.state = 'measuring'
    const previousHeight = element.style.height
    element.style.height = ''
    const measured = element.scrollHeight
    element.style.height = previousHeight
    element.dataset.state = previousState
    return measured
  }

  const syncProgressState = (progress: number) => {
    if (progress <= 0.001)
      applyHeroState('expanded')
    else if (progress >= 0.999)
      applyHeroState('compact')
    else
      applyHeroState('animating')

    if (state.headerElement && state.gsapInstance) {
      const headerVisible = progress >= headerAppearThreshold
      state.headerElement.dataset.state = headerVisible ? 'visible' : 'hidden'
      state.gsapInstance.set(state.headerElement, { pointerEvents: headerVisible ? 'auto' : 'none' })
    }
  }

  const buildTimeline = async () => {
    const heroEl = heroSection.value
    if (!heroEl || !state.gsapInstance || state.isBuilding)
      return

    state.isBuilding = true

    try {
      await nextTick()

      const canvasEl = heroEl.querySelector<HTMLCanvasElement>('.tuff-banner-canvas')
      const bannerEl = heroEl.querySelector<HTMLElement>('.tuff-banner')
      const heroContentEl = heroEl.querySelector<HTMLElement>('[data-hero-content]')
      const revealTargets = Array.from(heroEl.querySelectorAll<HTMLElement>('[data-hero-reveal]'))
      const highlightCards = Array.from(heroEl.querySelectorAll<HTMLElement>('[data-hero-highlight]'))
      const followingElements: HTMLElement[] = []
      let sibling = heroEl.nextElementSibling as HTMLElement | null
      while (sibling) {
        if (sibling instanceof HTMLElement)
          followingElements.push(sibling)
        sibling = sibling.nextElementSibling as HTMLElement | null
      }
      state.followingElements = followingElements

      state.headerElement = state.headerElement ?? document.querySelector<HTMLElement>('[data-role="main-header"]')
      const bodyElement = hasDocument() ? document.body : null

      if (bodyElement) {
        state.bodyFinalBackground = resolveBodyTargetBackground()
        state.gsapInstance.set(bodyElement, { backgroundColor: '#000' })
      }

      if (state.heroTimeline) {
        state.heroTimeline.scrollTrigger?.kill()
        state.heroTimeline.kill()
        state.heroTimeline = null
      }

      state.gsapInstance.set(heroEl, { clearProps: 'height,minHeight,overflow,borderRadius,transform,width,marginLeft,marginRight,backgroundColor' })
      if (heroContentEl)
        state.gsapInstance.set(heroContentEl, { clearProps: 'transform,opacity,borderRadius,width' })
      if (bannerEl)
        state.gsapInstance.set(bannerEl, { clearProps: 'transform,opacity' })
      if (canvasEl)
        state.gsapInstance.set(canvasEl, { clearProps: 'transform,opacity' })
      if (state.followingElements.length)
        state.gsapInstance.set(state.followingElements, { clearProps: 'opacity,transform,pointerEvents' })

      if (state.headerElement) {
        state.headerElement.dataset.state = 'hidden'
        state.gsapInstance.set(state.headerElement, { opacity: 0, yPercent: -100, pointerEvents: 'none' })
      }

      if (revealTargets.length)
        state.gsapInstance.set(revealTargets, { opacity: state.hasBannerInitialReveal ? 1 : 0, y: state.hasBannerInitialReveal ? 0 : 36 })
      if (highlightCards.length)
        state.gsapInstance.set(highlightCards, { opacity: state.hasBannerInitialReveal ? 1 : 0, y: state.hasBannerInitialReveal ? 0 : 24 })
      if (state.followingElements.length) {
        state.gsapInstance.set(state.followingElements, {
          opacity: state.hasBannerInitialReveal ? 1 : 0,
          pointerEvents: state.hasBannerInitialReveal ? 'auto' : 'none',
          y: state.hasBannerInitialReveal ? 0 : 48,
        })
      }
      if (heroContentEl) {
        state.gsapInstance.set(heroContentEl, {
          transformOrigin: 'center center',
          scale: 1,
          borderRadius: 0,
          width: '100%',
          yPercent: 0,
        })
      }
      if (bannerEl) {
        state.gsapInstance.set(bannerEl, {
          transformOrigin: 'center center',
          scale: 1,
          opacity: state.hasBannerInitialReveal ? 1 : 0,
        })
      }
      if (canvasEl)
        state.gsapInstance.set(canvasEl, { opacity: state.hasBannerInitialReveal ? 1 : 0 })

      const viewportHeight = window.innerHeight
      const naturalHeight = measureCompactHeight(heroEl)
      const compactTargetHeight = Math.min(naturalHeight, Math.max(520, viewportHeight * 0.78))
      const isWideViewport = window.innerWidth >= 1024
      const scrollDistance = Math.max(viewportHeight * 1.2, naturalHeight + 320)

      applyHeroState('expanded')
      state.gsapInstance.set(heroEl, {
        height: viewportHeight,
        minHeight: viewportHeight,
        borderRadius: 0,
        overflow: 'hidden',
        transformOrigin: 'center center',
        backgroundColor: '#000',
        scale: 1,
        yPercent: 0,
      })

      state.heroTimeline = state.gsapInstance.timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: {
          trigger: heroEl,
          start: 'top top',
          end: () => `+=${scrollDistance}`,
          scrub: true,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onEnter: () => applyHeroState('animating'),
          onLeave: () => {
            applyHeroState('compact')
            const finalBackground = state.bodyFinalBackground ?? resolveBodyTargetBackground()
            state.gsapInstance?.set(heroEl, {
              height: '',
              minHeight: '',
              backgroundColor: finalBackground,
              yPercent: 0,
            })
            if (hasDocument() && finalBackground) {
              state.gsapInstance?.set(document.body, { backgroundColor: finalBackground })
              state.bodyFinalBackground = finalBackground
            }
            if (state.followingElements.length)
              state.gsapInstance?.set(state.followingElements, { opacity: 1, pointerEvents: 'auto', y: 0 })
          },
          onEnterBack: () => {
            applyHeroState('animating')
            const finalBackground = resolveBodyTargetBackground()
            state.bodyFinalBackground = finalBackground
            if (hasDocument())
              state.gsapInstance?.set(document.body, { backgroundColor: '#000' })
            state.gsapInstance?.set(heroEl, {
              height: viewportHeight,
              minHeight: viewportHeight,
              borderRadius: 0,
              overflow: 'hidden',
              transformOrigin: 'center center',
              backgroundColor: '#000',
              yPercent: 0,
            })
          },
          onLeaveBack: () => applyHeroState('expanded'),
          onRefresh: (self: any) => syncProgressState(self.progress),
        },
      })

      const paddingRevealStart = Math.min(Math.max(paddingRevealThreshold, 0.6), 0.88)

      state.heroTimeline.to(
        heroEl,
        {
          borderRadius: isWideViewport ? '3rem' : '1.5rem',
          duration: 1,
          ease: 'power2.out',
        },
        0,
      )

      state.heroTimeline.to(
        heroEl,
        {
          height: compactTargetHeight,
          minHeight: compactTargetHeight,
          duration: 1.1,
          ease: 'power3.out',
        },
        0.2,
      )

      state.heroTimeline.to(
        heroEl,
        {
          yPercent: isWideViewport ? -12 : -8,
          duration: 0.9,
          ease: 'power2.out',
        },
        0.4,
      )

      if (heroContentEl && isWideViewport) {
        state.heroTimeline.to(
          heroContentEl,
          {
            scale: 0.95,
            duration: 1.05,
            ease: 'power3.out',
          },
          0.1,
        )
        state.heroTimeline.to(
          heroContentEl,
          {
            yPercent: -14,
            duration: 0.9,
            ease: 'power2.out',
          },
          0.35,
        )
      }

      if (bannerEl) {
        state.heroTimeline.to(
          bannerEl,
          { scale: 1, duration: 1.2, ease: 'power3.out' },
          0,
        )
      }

      if (bannerEl && !state.hasBannerInitialReveal) {
        state.gsapInstance.to(
          bannerEl,
          { opacity: 1, duration: 0.4, delay: 0.2, ease: 'power1.out' },
        )
      }

      if (canvasEl && !state.hasBannerInitialReveal) {
        state.gsapInstance.to(
          canvasEl,
          { opacity: 1, duration: 0.4, delay: 0.2, ease: 'power1.out' },
        )
      }

      if (revealTargets.length && !state.hasBannerInitialReveal) {
        state.gsapInstance.to(
          revealTargets,
          {
            opacity: 1,
            y: 0,
            stagger: 0.12,
            duration: 0.7,
            ease: 'power2.out',
            delay: 0.32,
          },
        )
      }

      if (highlightCards.length && !state.hasBannerInitialReveal) {
        state.gsapInstance.to(
          highlightCards,
          {
            opacity: 1,
            y: 0,
            stagger: 0.08,
            duration: 0.6,
            ease: 'power2.out',
            delay: 0.44,
          },
        )
      }

      if (state.followingElements.length) {
        state.heroTimeline.to(
          state.followingElements,
          {
            opacity: 1,
            pointerEvents: 'auto',
            duration: 0.6,
            ease: 'power2.out',
            y: 0,
          },
          paddingRevealStart,
        )
      }

      if (state.bodyFinalBackground && bodyElement) {
        state.heroTimeline.to(
          heroEl,
          {
            backgroundColor: state.bodyFinalBackground,
            duration: 0.6,
            ease: 'power2.inOut',
          },
          paddingRevealStart,
        )
        state.heroTimeline.to(
          bodyElement,
          {
            backgroundColor: state.bodyFinalBackground,
            duration: 0.6,
            ease: 'power2.inOut',
          },
          paddingRevealStart,
        )
      }

      if (!state.hasBannerInitialReveal)
        state.hasBannerInitialReveal = true

      if (state.headerElement) {
        state.heroTimeline.to(
          state.headerElement,
          {
            opacity: 1,
            yPercent: 0,
            duration: 0.6,
            ease: 'power2.out',
          },
          headerAppearThreshold,
        )
      }

      state.heroTimeline.eventCallback('onUpdate', () => {
        if (!state.heroTimeline)
          return
        syncProgressState(state.heroTimeline.progress())
      })

      syncProgressState(state.heroTimeline.progress())

      state.ScrollTriggerPlugin?.refresh()
      state.heroTimeline.scrollTrigger?.update()
      syncProgressState(state.heroTimeline.progress())
    }
    finally {
      state.isBuilding = false
    }
  }

  const handleResize = () => {
    if (state.resizeRaf)
      cancelAnimationFrame(state.resizeRaf)
    state.resizeRaf = requestAnimationFrame(() => {
      applyHeroState('expanded')
      void buildTimeline()
    })
  }

  onMounted(async () => {
    if (!import.meta.client)
      return

    if (hasDocument()) {
      const body = document.body
      if (!state.bodyOriginalBackground)
        state.bodyOriginalBackground = body.style.backgroundColor || ''
      body.style.backgroundColor = '#000'
    }

    const [{ default: gsap }, scrollTriggerModule] = await Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ])

    const ScrollTrigger = scrollTriggerModule.ScrollTrigger || scrollTriggerModule.default
    if (!ScrollTrigger)
      return

    gsap.registerPlugin(ScrollTrigger)
    state.gsapInstance = gsap
    state.ScrollTriggerPlugin = ScrollTrigger

    applyHeroState('expanded')
    await buildTimeline()
    if (hasWindow()) {
      window.addEventListener('resize', handleResize, { passive: true })
    }
  })

  onBeforeUnmount(() => {
    if (hasWindow()) {
      window.removeEventListener('resize', handleResize)
    }
    if (state.resizeRaf) {
      cancelAnimationFrame(state.resizeRaf)
      state.resizeRaf = null
    }
    if (state.heroTimeline) {
      state.heroTimeline.scrollTrigger?.kill()
      state.heroTimeline.kill()
      state.heroTimeline = null
    }
    if (heroSection.value && state.gsapInstance) {
      state.gsapInstance.set(heroSection.value, { clearProps: 'height,minHeight,overflow,borderRadius,width,marginLeft,marginRight,transform,backgroundColor' })
      heroSection.value.dataset.state = 'compact'
      const heroContent = heroSection.value.querySelector<HTMLElement>('[data-hero-content]')
      if (heroContent)
        state.gsapInstance.set(heroContent, { clearProps: 'transform,borderRadius,width' })
      if (state.followingElements.length)
        state.gsapInstance.set(state.followingElements, { clearProps: 'opacity,transform,pointerEvents' })
    }
    if (state.headerElement && state.gsapInstance) {
      state.gsapInstance.set(state.headerElement, { clearProps: 'opacity,transform,pointerEvents' })
      state.headerElement.dataset.state = 'visible'
    }
    if (hasDocument() && state.bodyOriginalBackground !== null)
      document.body.style.backgroundColor = state.bodyOriginalBackground
  })

  return {
    heroSection,
  }
}
