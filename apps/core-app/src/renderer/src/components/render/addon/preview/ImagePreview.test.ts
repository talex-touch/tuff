// @vitest-environment jsdom
import type { TuffItem } from '@talex-touch/utils'
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ImagePreview from './ImagePreview.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key })
}))

const item = {
  id: 'file:/Users/demo/Pictures/photo.png',
  kind: 'file',
  source: { id: 'file-provider', type: 'file', name: 'Documents' },
  render: { mode: 'default', basic: { title: 'photo.png' } },
  meta: { file: { path: '/Users/demo/Pictures/photo.png' } }
} as unknown as TuffItem

const FIRST = 'tfile:///preview/first.png'
const SECOND = 'tfile:///preview/second.png'

let wrapper: VueWrapper | null = null

function mountImage(resourceUrl = 'tfile:///preview/photo.png'): VueWrapper {
  wrapper?.unmount()
  wrapper = mount(ImagePreview, { props: { item, resourceUrl } })
  return wrapper
}

/**
 * The previous picture stays mounted while the next one fades in, so a bare `get('img')` can hand
 * back the outgoing element. Select by the source each element actually carries.
 */
function imageWithSrc(pane: VueWrapper, resourceUrl: string): DOMWrapper<Element> {
  const image = pane.findAll('img').find((node) => node.attributes('src') === resourceUrl)
  if (!image) throw new Error(`no mounted image for ${resourceUrl}`)
  return image
}

/** jsdom never decodes an image, so the intrinsic size the browser would report is declared here. */
function decodeAs(image: HTMLImageElement, width: number, height: number): void {
  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true })
}

/**
 * jsdom carries no transition machinery, so Vue removes the outgoing picture at once. In the app the
 * element outlives the swap while its leave transition plays, keeping its listeners wired, so it is
 * re-attached here to model the element whose late `load`/`error` the guard has to discard.
 */
function retireKeepingHandlers(pane: VueWrapper, resourceUrl: string): HTMLImageElement {
  const element = imageWithSrc(pane, resourceUrl).element as HTMLImageElement
  pane.element.appendChild(element)
  return element
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('ImagePreview reported dimensions', () => {
  it('reports the size the browser decoded when the picture loads', async () => {
    const pane = mountImage()
    const image = imageWithSrc(pane, 'tfile:///preview/photo.png')
    decodeAs(image.element as HTMLImageElement, 1280, 720)

    await image.trigger('load')

    expect(pane.emitted('dimensionsChange')).toEqual([['1280 × 720']])
    expect(pane.find('.loading-overlay').exists()).toBe(false)
  })

  it('reports an empty size when the browser decoded nothing', async () => {
    const pane = mountImage()

    await imageWithSrc(pane, 'tfile:///preview/photo.png').trigger('load')

    expect(pane.emitted('dimensionsChange')).toEqual([['']])
  })

  it('clears the reported size when the picture fails to load', async () => {
    const pane = mountImage()
    const image = imageWithSrc(pane, 'tfile:///preview/photo.png')
    decodeAs(image.element as HTMLImageElement, 1280, 720)
    await image.trigger('load')
    expect(pane.emitted('dimensionsChange')).toEqual([['1280 × 720']])

    await image.trigger('error')

    expect(pane.emitted('dimensionsChange')).toEqual([['1280 × 720'], ['']])
    expect(pane.find('.error-state').exists()).toBe(true)
  })

  it('clears the reported size when a different file is previewed', async () => {
    const pane = mountImage(FIRST)
    const image = imageWithSrc(pane, FIRST)
    decodeAs(image.element as HTMLImageElement, 1280, 720)
    await image.trigger('load')
    expect(pane.emitted('dimensionsChange')).toEqual([['1280 × 720']])

    await pane.setProps({ resourceUrl: SECOND })

    expect(pane.emitted('dimensionsChange')).toEqual([['1280 × 720'], ['']])
    expect(pane.find('.loading-overlay').exists()).toBe(true)
  })

  it('ignores a load that belongs to the picture it stopped showing', async () => {
    const pane = mountImage(FIRST)
    const element = retireKeepingHandlers(pane, FIRST)
    decodeAs(element, 1280, 720)
    element.dispatchEvent(new Event('load'))
    await pane.vm.$nextTick()
    expect(pane.emitted('dimensionsChange')).toEqual([['1280 × 720']])

    await pane.setProps({ resourceUrl: SECOND })
    element.dispatchEvent(new Event('load'))
    await pane.vm.$nextTick()

    expect(pane.emitted('dimensionsChange')).toEqual([['1280 × 720'], ['']])
    expect(pane.find('.loading-overlay').exists()).toBe(true)
  })

  it('ignores a failure that belongs to the picture it stopped showing', async () => {
    const pane = mountImage(FIRST)
    const element = retireKeepingHandlers(pane, FIRST)

    await pane.setProps({ resourceUrl: SECOND })
    element.dispatchEvent(new Event('error'))
    await pane.vm.$nextTick()

    expect(pane.emitted('dimensionsChange')).toEqual([['']])
    expect(pane.find('.error-state').exists()).toBe(false)
  })
})
