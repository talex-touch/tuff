import { hasWindow } from '@talex-touch/utils/env'
import { reserveOverlayLayer } from '~/utils/layers'

export type SearchSource = 'docs' | 'tuffex' | 'feature' | 'page'

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
  // Set when the results came without the docs index, which failed to load: an empty list
  // then means the search could not look, not that nothing matched.
  const unavailable = useState<boolean>('global-search-unavailable', () => false)
  const anchorRect = useState<SearchAnchorRect | null>('global-search-anchor-rect', () => null)
  // The palette plays its own enter and exit, so once mounted it stays mounted. Mounting it
  // with `open` already true skipped the enter, and unmounting it on close removed the
  // backdrop before any exit could run.
  const mounted = useState<boolean>('global-search-mounted', () => false)

  function prefersReducedMotion() {
    return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function resetSearchState() {
    query.value = ''
    results.value = []
    loading.value = false
    unavailable.value = false
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

  /**
   * Claim a layer before the palette mounts. TxCommandPalette allocates its own
   * z-index synchronously when `open` flips, so the floor has to be raised first.
   */
  function markSearchOpen() {
    reserveOverlayLayer('nexus-global-search')
    mounted.value = true
    open.value = true
  }

  /** Mounts the palette closed, so that its first open does not wait for it. */
  function mountSearch() {
    mounted.value = true
  }

  function openSearch(anchor?: HTMLElement | null) {
    resetSearchState()
    setSearchAnchor(anchor)
    markSearchOpen()
  }

  /**
   * Opens on the same frame as the click or shortcut. This used to play a pulse on the
   * trigger first and only open 120ms into it, after fetching gsap for the pulse, and the
   * pulse itself was hidden under the backdrop it summoned. The anchor is still recorded:
   * the panel drifts in from its side.
   */
  function summonSearch(anchor?: HTMLElement | null) {
    if (open.value)
      return
    openSearch(anchor)
  }

  function closeSearch() {
    open.value = false
  }

  return {
    open,
    query,
    results,
    loading,
    unavailable,
    anchorRect,
    mounted,
    openSearch,
    summonSearch,
    mountSearch,
    prefersReducedMotion,
    closeSearch,
    resetSearchState,
    clearSearchAnchor,
  }
}
