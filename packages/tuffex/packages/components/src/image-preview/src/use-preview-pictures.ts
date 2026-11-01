import type { Ref } from 'vue'
import type { PreviewOrigin } from './flight'
import type { ImagePreviewItem } from './types'
import type { PreviewBox, PreviewSize } from './zoom'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { hasDocument } from '../../../../utils/env'

// The pictures: their sizes once loaded, the ones that failed, a thumbnail's pixels standing in
// while the preview's own copy loads, and the placeholder's shimmer. Keyed by URL, so a host that
// swaps a failed URL for a new one gets a fresh load.

/** A thumbnail's pixels, drawn in a picture's place while the preview's own copy loads. */
export interface PreviewStandIn {
  src: string
  /** The shape the picture is drawn at meanwhile. */
  size: PreviewSize
}

/** A stand-in stays this long after its picture arrives (ms): the picture fades in over it. */
const STAND_IN_MS = 260
// The placeholder holds a loading picture's place from the start, but its shimmer waits this
// long after opening, so a picture that arrives sooner swaps in without it flashing first.
const SKELETON_DELAY_MS = 150

export interface PreviewPicturesOptions {
  items: () => readonly ImagePreviewItem[]
  /** A content slot replaces the image renderer for every item. */
  custom?: () => boolean
  current: Readonly<Ref<number>>
  /** The URLs the host already knows to have failed. */
  hostFailed: () => Iterable<string> | undefined
  /** Where the picture is fitted: a stand-in's shape covers it. */
  fitBox: () => PreviewBox
  onError: (url: string, at: number) => void
}

export interface PreviewPictures {
  sizes: Ref<Map<string, PreviewSize>>
  standIns: Readonly<Ref<ReadonlyMap<string, PreviewStandIn>>>
  /** The placeholder shimmers. */
  skeletonShown: Readonly<Ref<boolean>>
  isFailed: (url: string | undefined) => boolean
  isLoaded: (url: string | undefined) => boolean
  isCustom: (item: ImagePreviewItem) => boolean
  /** Custom canvases are ready synchronously; images wait for their actual pixels. */
  readySize: (item: ImagePreviewItem) => PreviewSize | null
  /** The shape a picture is expected at: the host's, else the last picture's. */
  shapeOf: (item: ImagePreviewItem) => PreviewSize
  /** The size a picture is drawn at: its own once loaded, else its stand-in's, else its expected shape. */
  sizeOf: (item: ImagePreviewItem) => PreviewSize
  markLoaded: (image: HTMLImageElement) => void
  onImageLoad: (event: Event) => void
  onImageError: (event: Event, at: number) => void
  /** A picture the browser already holds is complete as soon as its element exists. */
  bindImage: (el: unknown) => void
  /**
   * What the thumbnail knows of the picture: its size, when it shows this very picture, or its
   * pixels, to stand in until the preview's own copy arrives.
   */
  adoptOrigin: (item: ImagePreviewItem, origin: PreviewOrigin) => void
  clearStandIns: () => void
  /** Starts the shimmer's wait, for an opening. */
  armSkeleton: () => void
  clearSkeletonTimer: () => void
}

function sameUrl(a: string, b: string): boolean {
  if (a === b)
    return true
  try {
    return new URL(a, document.baseURI).href === new URL(b, document.baseURI).href
  }
  catch {
    return false
  }
}

/** `size`, scaled to cover `box`: a stand-in's shape, which the fit then brings down to fill the box. */
function coverSize(size: PreviewSize, box: PreviewBox): PreviewSize {
  if (!(box.width > 0 && box.height > 0))
    return size
  const k = Math.max(box.width / size.width, box.height / size.height)
  return { width: size.width * k, height: size.height * k }
}

export function usePreviewPictures(options: PreviewPicturesOptions): PreviewPictures {
  const sizes = shallowRef(new Map<string, PreviewSize>())
  const failedHere = shallowRef(new Set<string>())
  const hostFailed = computed(() => new Set(options.hostFailed() ?? []))
  // The size of the picture last looked at, the best guess for the next when the host gives none.
  // A neighbour loading in the background does not count: it is not what the person just saw.
  const lastShape = shallowRef<PreviewSize>({ width: 800, height: 600 })
  const standIns = shallowRef(new Map<string, PreviewStandIn>())
  const standInTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const skeletonShown = ref(false)
  let skeletonTimer: ReturnType<typeof setTimeout> | undefined

  function isFailed(url: string | undefined): boolean {
    return !!url && (hostFailed.value.has(url) || failedHere.value.has(url))
  }

  function isLoaded(url: string | undefined): boolean {
    return !!url && sizes.value.has(url)
  }

  function shapeOf(item: ImagePreviewItem): PreviewSize {
    return item.width && item.height && item.width > 0 && item.height > 0
      ? { width: item.width, height: item.height }
      : lastShape.value
  }

  const isCustom = (item: ImagePreviewItem): boolean => item.type === 'custom' || !!options.custom?.()

  function readySize(item: ImagePreviewItem): PreviewSize | null {
    if (isCustom(item))
      return shapeOf(item)
    return item.url && !isFailed(item.url) ? sizes.value.get(item.url) ?? null : null
  }

  function sizeOf(item: ImagePreviewItem): PreviewSize {
    return readySize(item) ?? (item.url ? standIns.value.get(item.url)?.size : undefined) ?? shapeOf(item)
  }

  function dropStandIn(url: string): void {
    if (!standIns.value.has(url) || standInTimers.has(url))
      return
    standInTimers.set(url, setTimeout(() => {
      standInTimers.delete(url)
      const next = new Map(standIns.value)
      if (next.delete(url))
        standIns.value = next
    }, STAND_IN_MS))
  }

  function clearStandIns(): void {
    for (const timer of standInTimers.values())
      clearTimeout(timer)
    standInTimers.clear()
    if (standIns.value.size > 0)
      standIns.value = new Map()
  }

  // The URL comes off the element, not the slide: an <img> paged away from can still finish loading.
  function markLoaded(image: HTMLImageElement): void {
    const url = image.getAttribute('src')
    if (!url || sizes.value.has(url))
      return
    const items = options.items()
    const item = items.find(candidate => candidate.url === url)
    // An SVG without its own size reports none; it takes the host's, or the last picture's.
    const size = image.naturalWidth > 0 && image.naturalHeight > 0
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : item ? shapeOf(item) : lastShape.value
    if (url === items[options.current.value]?.url)
      lastShape.value = size
    sizes.value = new Map(sizes.value).set(url, size)
    dropStandIn(url)
  }

  watch(options.current, (_, previous) => {
    const size = sizes.value.get(options.items()[previous]?.url ?? '')
    if (size)
      lastShape.value = size
  })

  function onImageLoad(event: Event): void {
    markLoaded(event.target as HTMLImageElement)
  }

  function onImageError(event: Event, at: number): void {
    const url = (event.target as HTMLImageElement).getAttribute('src')
    if (!url || failedHere.value.has(url))
      return
    failedHere.value = new Set(failedHere.value).add(url)
    options.onError(url, at)
  }

  // Marked before the first paint, a cached page never flashes the placeholder.
  function bindImage(el: unknown): void {
    if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0)
      markLoaded(el)
  }

  function adoptOrigin(item: ImagePreviewItem, origin: PreviewOrigin): void {
    const image = origin.image
    if (item.type === 'custom' || options.custom?.() || !item.url || !image || !image.complete || !(image.naturalWidth > 0 && image.naturalHeight > 0) || isLoaded(item.url))
      return
    const natural = { width: image.naturalWidth, height: image.naturalHeight }
    const src = image.currentSrc || image.src
    if (sameUrl(src, item.url)) {
      sizes.value = new Map(sizes.value).set(item.url, natural)
      return
    }
    const known = item.width && item.height && item.width > 0 && item.height > 0 ? { width: item.width, height: item.height } : null
    standIns.value = new Map(standIns.value).set(item.url, { src, size: known ?? coverSize(natural, options.fitBox()) })
  }

  function clearSkeletonTimer(): void {
    if (skeletonTimer !== undefined)
      clearTimeout(skeletonTimer)
    skeletonTimer = undefined
  }

  function armSkeleton(): void {
    clearSkeletonTimer()
    skeletonShown.value = false
    if (!hasDocument())
      return
    skeletonTimer = setTimeout(() => {
      skeletonTimer = undefined
      skeletonShown.value = true
    }, SKELETON_DELAY_MS)
  }

  onBeforeUnmount(() => {
    clearSkeletonTimer()
    clearStandIns()
  })

  return {
    sizes,
    standIns,
    skeletonShown,
    isFailed,
    isLoaded,
    isCustom,
    readySize,
    shapeOf,
    sizeOf,
    markLoaded,
    onImageLoad,
    onImageError,
    bindImage,
    adoptOrigin,
    clearStandIns,
    armSkeleton,
    clearSkeletonTimer,
  }
}
