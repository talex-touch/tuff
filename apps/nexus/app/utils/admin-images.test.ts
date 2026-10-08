import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { ImageResource, ImageResourcePage } from './admin-images'
import {
  createImageResourceList,
  fetchImageResourcePage,
  IMAGE_RESOURCE_PAGE_SIZE,
  isPreviewableResource,
  resourceAbsoluteUrl,
} from './admin-images'

/**
 * The Asset Library pages the bucket with its own cursor (requirement R5 of the
 * 09-23 admin console plan): the first 60 keys, then "Load more". Before, the
 * page asked for every key at once and a failed listing rendered "No resources
 * uploaded yet".
 */

function resources(count: number, offset = 0): ImageResource[] {
  return Array.from({ length: count }, (_, index) => {
    const key = `${String(index + offset).padStart(4, '0')}.png`
    return { key, url: `/api/images/${key}` }
  })
}

/** A bucket of `count` keys behind the paged endpoint, cursor = index of the next key. */
function bucket(count: number, limit = IMAGE_RESOURCE_PAGE_SIZE) {
  const all = resources(count)
  return vi.fn(async (cursor: string | null): Promise<ImageResourcePage> => {
    const start = cursor ? Number(cursor) : 0
    const images = all.slice(start, start + limit)
    const next = start + images.length
    const truncated = next < all.length
    return { images, cursor: truncated ? String(next) : null, truncated }
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const fallback = () => 'Resources could not be loaded.'
const moreFallback = () => 'More resources could not be loaded.'

describe('fetchImageResourcePage', () => {
  it('asks for the first page without a cursor and for later pages with it', async () => {
    const request = vi.fn(async () => ({ images: resources(2), cursor: 'next', truncated: true }))

    expect(await fetchImageResourcePage(request, null)).toEqual({ images: resources(2), cursor: 'next', truncated: true })
    expect(request).toHaveBeenLastCalledWith('/api/images/list', { query: { limit: 60 } })

    await fetchImageResourcePage(request, 'next')
    expect(request).toHaveBeenLastCalledWith('/api/images/list', { query: { limit: 60, cursor: 'next' } })
  })

  it('drops a cursor the listing did not mark as truncated, and a malformed body', async () => {
    expect(await fetchImageResourcePage(async () => ({ images: resources(1), cursor: 'stale', truncated: false }), null))
      .toEqual({ images: resources(1), cursor: null, truncated: false })
    expect(await fetchImageResourcePage(async () => null, null)).toEqual({ images: [], cursor: null, truncated: false })
  })
})

describe('resource cards', () => {
  it('previews raster images only', () => {
    expect(['a.png', 'b.JPG', 'c.jpeg', 'd.webp', 'e.gif', 'f.avif'].every(isPreviewableResource)).toBe(true)
    // An SVG is served as an attachment, so an <img> could only show it broken.
    expect(['a.svg', 'b.zip', 'c.tpex', 'd.pdf'].some(isPreviewableResource)).toBe(false)
  })

  it('copies the address with the site origin', () => {
    expect(resourceAbsoluteUrl('/api/images/a.png', 'https://tuff.chat')).toBe('https://tuff.chat/api/images/a.png')
    expect(resourceAbsoluteUrl('https://cdn.example/a.png', 'https://tuff.chat')).toBe('https://cdn.example/a.png')
  })
})

describe('createImageResourceList', () => {
  it('shows the skeleton until the first page answers, then the page', async () => {
    const fetchPage = bucket(61)
    const list = createImageResourceList(fetchPage, fallback, moreFallback)
    // Never "no resources" before the listing has been asked.
    expect(list.loading.value).toBe(true)
    expect(list.items.value).toEqual([])

    await list.reload()
    expect(list.loading.value).toBe(false)
    expect(list.items.value).toHaveLength(60)
    expect(list.truncated.value).toBe(true)
  })

  it('follows the cursor with "Load more" until the listing ends', async () => {
    // More than one page of keys: 60 first, the 61st behind "Load more".
    const fetchPage = bucket(61)
    const list = createImageResourceList(fetchPage, fallback, moreFallback)
    await list.reload()

    await list.loadMore()
    expect(fetchPage).toHaveBeenLastCalledWith('60')
    expect(list.items.value).toHaveLength(61)
    expect(list.items.value.at(-1)!.key).toBe('0060.png')
    expect(list.truncated.value).toBe(false)

    // Nothing more to ask for.
    await list.loadMore()
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('keeps the loaded cards when "Load more" fails, and lets it retry', async () => {
    const fetchPage = bucket(61)
    const list = createImageResourceList(fetchPage, fallback, moreFallback)
    await list.reload()

    fetchPage.mockRejectedValueOnce(new Error('[GET] "/api/images/list?limit=60&cursor=60": 500'))
    await list.loadMore()
    expect(list.items.value).toHaveLength(60)
    expect(list.moreError.value).toBe('More resources could not be loaded.')
    expect(list.error.value).toBeNull()
    expect(list.truncated.value).toBe(true)

    await list.loadMore()
    expect(list.moreError.value).toBeNull()
    expect(list.items.value).toHaveLength(61)
  })

  it('reports a failed listing as an error, not as an empty library', async () => {
    const list = createImageResourceList(async () => {
      throw new Error('[GET] "/api/images/list?limit=60": 500 Internal Server Error')
    }, fallback, moreFallback)
    await list.reload()

    expect(list.error.value).toBe('Resources could not be loaded.')
    expect(list.error.value).not.toContain('/api/')
    expect(list.loading.value).toBe(false)
    expect(list.items.value).toEqual([])
  })

  it('prefers the server\'s own message', async () => {
    const list = createImageResourceList(async () => {
      throw Object.assign(new Error('[GET] "/api/images/list": 403'), { data: { message: 'Admin permission required.' } })
    }, fallback, moreFallback)
    await list.reload()
    expect(list.error.value).toBe('Admin permission required.')
  })

  it('keeps the cards on screen while the first page loads again', async () => {
    const fetchPage = bucket(10)
    const list = createImageResourceList(fetchPage, fallback, moreFallback)
    await list.reload()

    const next = deferred<ImageResourcePage>()
    fetchPage.mockReturnValueOnce(next.promise)
    const reloading = list.reload()
    expect(list.refreshing.value).toBe(true)
    expect(list.loading.value).toBe(false)
    expect(list.items.value).toHaveLength(10)

    next.resolve({ images: resources(3), cursor: null, truncated: false })
    await reloading
    expect(list.refreshing.value).toBe(false)
    expect(list.items.value).toHaveLength(3)
  })

  it('drops a "Load more" page that arrives after a reload started', async () => {
    const fetchPage = bucket(61)
    const list = createImageResourceList(fetchPage, fallback, moreFallback)
    await list.reload()

    const late = deferred<ImageResourcePage>()
    fetchPage.mockReturnValueOnce(late.promise)
    const loadingMore = list.loadMore()
    expect(list.loadingMore.value).toBe(true)

    const reloading = list.reload()
    expect(list.loadingMore.value).toBe(false)
    late.resolve({ images: resources(1, 900), cursor: null, truncated: false })
    await Promise.all([loadingMore, reloading])

    expect(list.items.value.some(item => item.key === '0900.png')).toBe(false)
    expect(list.items.value).toHaveLength(60)
    expect(list.truncated.value).toBe(true)
  })

  it('drops an older first page that answers after a newer one', async () => {
    const fetchPage = vi.fn<(cursor: string | null) => Promise<ImageResourcePage>>()
    const slow = deferred<ImageResourcePage>()
    fetchPage.mockReturnValueOnce(slow.promise)
    fetchPage.mockResolvedValueOnce({ images: resources(2), cursor: null, truncated: false })
    const list = createImageResourceList(fetchPage, fallback, moreFallback)

    const first = list.reload()
    await list.reload()
    slow.resolve({ images: resources(9), cursor: '9', truncated: true })
    await first

    expect(list.items.value).toHaveLength(2)
    expect(list.truncated.value).toBe(false)
  })

  it('puts an upload first and takes a deleted resource out without asking again', async () => {
    const fetchPage = bucket(3)
    const list = createImageResourceList(fetchPage, fallback, moreFallback)
    await list.reload()

    list.prepend({ key: 'new.png', url: '/api/images/new.png' })
    list.prepend({ key: '0001.png', url: '/api/images/0001.png' })
    expect(list.items.value.map(item => item.key)).toEqual(['0001.png', 'new.png', '0000.png', '0002.png'])

    list.remove('new.png')
    expect(list.items.value.map(item => item.key)).toEqual(['0001.png', '0000.png', '0002.png'])
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('stops writing state once its scope is gone', async () => {
    const scope = effectScope()
    const late = deferred<ImageResourcePage>()
    const list = scope.run(() => createImageResourceList(() => late.promise, fallback, moreFallback))!
    const loading = list.reload()
    scope.stop()

    late.resolve({ images: resources(4), cursor: null, truncated: false })
    await loading
    expect(list.items.value).toEqual([])
  })
})
