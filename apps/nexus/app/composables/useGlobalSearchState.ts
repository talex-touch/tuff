import { hasWindow } from '@talex-touch/utils/env'

export type SearchSource = 'docs' | 'feature' | 'page'

export interface GlobalSearchResult {
  id: string
  source: SearchSource
  title: string
  description?: string
  to: string
  score: number
  icon?: string
  keywords?: string[]
}

export interface SearchAnchorRect {
  top: number
  left: number
  width: number
  height: number
  radius: string
}

export function useGlobalSearchState() {
  const open = useState<boolean>('global-search-open', () => false)
  const query = useState<string>('global-search-query', () => '')
  const results = useState<GlobalSearchResult[]>('global-search-results', () => [])
  const loading = useState<boolean>('global-search-loading', () => false)
  const anchorRect = useState<SearchAnchorRect | null>('global-search-anchor-rect', () => null)

  function prefersReducedMotion() {
    return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function resetSearchState() {
    query.value = ''
    results.value = []
    loading.value = false
  }

  function setSearchAnchor(anchor?: HTMLElement | null) {
    if (!anchor || !hasWindow()) {
      anchorRect.value = null
      return
    }
    const rect = anchor.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      anchorRect.value = null
      return
    }
    const computed = getComputedStyle(anchor)
    const rawRadius = Number.parseFloat(computed.borderRadius)
    const clampedRadius = Number.isFinite(rawRadius)
      ? Math.min(rawRadius, rect.height / 2)
      : rect.height / 2
    const radius = `${Math.max(clampedRadius, 0)}px`
    anchorRect.value = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      radius,
    }
  }

  function clearSearchAnchor() {
    anchorRect.value = null
  }

  function openSearch(anchor?: HTMLElement | null) {
    resetSearchState()
    setSearchAnchor(anchor)
    open.value = true
  }

  async function summonSearch(anchor?: HTMLElement | null) {
    if (open.value)
      return
    resetSearchState()
    setSearchAnchor(anchor)
    if (!anchor || !hasWindow() || prefersReducedMotion()) {
      open.value = true
      return
    }
    const rect = anchor.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      open.value = true
      return
    }
    const { gsap } = await import('gsap')
    gsap.killTweensOf(anchor)
    gsap.set(anchor, {
      transformOrigin: 'center',
      willChange: 'transform,border-color',
    })
    gsap.timeline({
      onComplete: () => {
        gsap.set(anchor, { clearProps: 'transform,borderColor,willChange' })
      },
    })
      .to(anchor, {
        scale: 1.01,
        borderColor: 'rgba(64, 158, 255, 0.35)',
        duration: 0.1,
        ease: 'power2.out',
      })
      .add(() => {
        open.value = true
      }, 0.12)
      .to(anchor, {
        scale: 1,
        borderColor: 'transparent',
        duration: 0.12,
        ease: 'power2.inOut',
      }, 0.12)
  }

  function closeSearch() {
    open.value = false
  }

  return {
    open,
    query,
    results,
    loading,
    anchorRect,
    openSearch,
    summonSearch,
    prefersReducedMotion,
    closeSearch,
    resetSearchState,
    clearSearchAnchor,
  }
}
