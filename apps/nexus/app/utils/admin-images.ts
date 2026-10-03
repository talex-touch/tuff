import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'

/**
 * Asset Library (`/admin/images`): one page of the bucket at a time, in the
 * order the bucket lists keys, with "Load more" following its cursor. The
 * cursor is the storage listing's own continuation token, so it is not put in
 * the URL — it means nothing outside the listing it came from.
 */

export interface ImageResource {
  key: string
  url: string
}

export interface ImageResourcePage {
  images: ImageResource[]
  /** Continuation token for the next page; `null` once the listing is complete. */
  cursor: string | null
  truncated: boolean
}

/** Keys per page. The endpoint defaults to 60 too and caps a page at 200. */
export const IMAGE_RESOURCE_PAGE_SIZE = 60

export type ImageResourceRequest = (path: string, options: { query: Record<string, string | number> }) => Promise<unknown>

/** `GET /api/images/list?limit=&cursor=` — the paged form of the listing. */
export async function fetchImageResourcePage(
  request: ImageResourceRequest,
  cursor: string | null,
  limit = IMAGE_RESOURCE_PAGE_SIZE,
): Promise<ImageResourcePage> {
  const query: Record<string, string | number> = { limit }
  if (cursor)
    query.cursor = cursor
  const response = await request('/api/images/list', { query }) as Partial<ImageResourcePage> | null
  const truncated = response?.truncated === true
  return {
    images: Array.isArray(response?.images) ? response.images : [],
    cursor: truncated && typeof response?.cursor === 'string' && response.cursor ? response.cursor : null,
    truncated,
  }
}

// Raster formats only: an SVG is served as an attachment (`/api/images/[key]`,
// #896), so an <img> pointing at one would only ever show a broken image.
const PREVIEWABLE_EXTENSION = /\.(?:png|jpe?g|gif|webp|avif|bmp|ico)$/i

export function isPreviewableResource(key: string): boolean {
  return PREVIEWABLE_EXTENSION.test(key)
}

/** What "Copy URL" puts on the clipboard: the address with the site's origin, ready to paste anywhere. */
export function resourceAbsoluteUrl(url: string, origin: string): string {
  try {
    return new URL(url, origin).href
  }
  catch {
    return url
  }
}

export interface ImageResourceList {
  items: Readonly<Ref<ImageResource[]>>
  /** More keys exist past the last loaded page. */
  truncated: Readonly<Ref<boolean>>
  /** The first page is on its way and nothing is on screen: draw the skeleton. True before the first request. */
  loading: ComputedRef<boolean>
  /** The first page is being loaded again; the current cards stay. */
  refreshing: ComputedRef<boolean>
  loadingMore: Readonly<Ref<boolean>>
  /** The first page failed: nothing to show but the error and a retry. */
  error: Readonly<Ref<string | null>>
  /** "Load more" failed: the loaded cards stay, the button retries. */
  moreError: Readonly<Ref<string | null>>
  /** Loads the first page, replacing what is shown once it answers. */
  reload: () => Promise<void>
  loadMore: () => Promise<void>
  /** A resource uploaded on this page: shown first, without reloading the listing. */
  prepend: (item: ImageResource) => void
  /** A resource deleted on this page. The cursor stays valid: it points past the keys already listed. */
  remove: (key: string) => void
}

/**
 * The listing as the page holds it. Like `useAdminList`, every first-page
 * request carries a generation and a late answer to an older one is dropped, a
 * failure is reported without leaking the transport's `[GET] "/api/…"` text, and
 * `loading` is true from the start, so the grid never says "nothing here" before
 * it has asked. A "Load more" that started before a reload is dropped too.
 */
export function createImageResourceList(
  fetchPage: (cursor: string | null) => Promise<ImageResourcePage>,
  errorFallback: () => string,
  moreErrorFallback: () => string = errorFallback,
): ImageResourceList {
  const items = shallowRef<ImageResource[]>([])
  const truncated = ref(false)
  const cursor = ref<string | null>(null)
  const pending = ref(true)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const moreError = ref<string | null>(null)
  let generation = 0
  let disposed = false

  async function reload(): Promise<void> {
    if (disposed)
      return
    const request = ++generation
    pending.value = true
    loadingMore.value = false
    error.value = null
    moreError.value = null
    try {
      const page = await fetchPage(null)
      if (request !== generation)
        return
      items.value = page.images
      cursor.value = page.cursor
      truncated.value = page.truncated
    }
    catch (cause) {
      if (request !== generation)
        return
      items.value = []
      cursor.value = null
      truncated.value = false
      error.value = resolveAdminErrorMessage(cause, errorFallback())
    }
    finally {
      if (request === generation)
        pending.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (disposed || pending.value || loadingMore.value || !truncated.value || !cursor.value)
      return
    const request = generation
    loadingMore.value = true
    moreError.value = null
    try {
      const page = await fetchPage(cursor.value)
      if (request !== generation)
        return
      const known = new Set(items.value.map(item => item.key))
      items.value = [...items.value, ...page.images.filter(item => !known.has(item.key))]
      cursor.value = page.cursor
      truncated.value = page.truncated
    }
    catch (cause) {
      if (request !== generation)
        return
      moreError.value = resolveAdminErrorMessage(cause, moreErrorFallback())
    }
    finally {
      if (request === generation)
        loadingMore.value = false
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      generation += 1
    })
  }

  return {
    items,
    truncated,
    loading: computed(() => pending.value && items.value.length === 0),
    refreshing: computed(() => pending.value && items.value.length > 0),
    loadingMore,
    error,
    moreError,
    reload,
    loadMore,
    prepend(item) {
      items.value = [item, ...items.value.filter(existing => existing.key !== item.key)]
    },
    remove(key) {
      items.value = items.value.filter(item => item.key !== key)
    },
  }
}
