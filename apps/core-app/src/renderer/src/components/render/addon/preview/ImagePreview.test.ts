// @vitest-environment jsdom
import type { TuffItem } from '@talex-touch/utils'
import { mount, type VueWrapper } from '@vue/test-utils'
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

let wrapper: VueWrapper | null = null

function mountImage(resourceUrl = 'tfile:///preview/photo.png'): VueWrapper {
  wrapper?.unmount()
  wrapper = mount(ImagePreview, { props: { item, resourceUrl } })
  return wrapper
}

/** jsdom never decodes an image, so the intrinsic size the browser would report is declared here. */
function decodeAs(image: HTMLImageElement, width: number, height: number): void {
  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true })
}

/** jsdom performs no layout, so the picture's rendered box is declared here. */
function layOut(
  element: HTMLElement,
  top: number,
  left: number,
  width: number,
  height: number
): void {
  const rect = { top, left, width, height, right: left + width, bottom: top + height }
  element.getBoundingClientRect = () =>
    ({ ...rect, x: left, y: top, toJSON: () => rect }) as DOMRect
}

function badgeStyle(): CSSStyleDeclaration {
  return (wrapper!.get('.dimension-badge').element as HTMLElement).style
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('ImagePreview dimension badge', () => {
  it('labels the picture with the size the browser decoded', async () => {
    const pane = mountImage()
    const image = pane.get('img').element as HTMLImageElement
    decodeAs(image, 1280, 720)
    layOut(pane.element as HTMLElement, 0, 0, 1080, 760)
    layOut(image, 20, 40, 1000, 720)

    await pane.get('img').trigger('load')

    expect(pane.get('.dimension-badge').text()).toBe('1280 × 720')
    expect(badgeStyle().display).not.toBe('none')
    expect(pane.find('.loading-overlay').exists()).toBe(false)
  })

  it('does not label a picture the browser has not sized', async () => {
    const pane = mountImage()

    await pane.get('img').trigger('load')

    expect(pane.find('.dimension-badge').exists()).toBe(false)
  })

  it('drops the size label when the picture fails to load', async () => {
    const pane = mountImage()
    decodeAs(pane.get('img').element as HTMLImageElement, 1280, 720)
    await pane.get('img').trigger('load')
    expect(pane.find('.dimension-badge').exists()).toBe(true)

    await pane.get('img').trigger('error')

    expect(pane.find('.dimension-badge').exists()).toBe(false)
    expect(pane.find('.error-state').exists()).toBe(true)
    expect((pane.get('img').element as HTMLElement).style.display).toBe('none')
  })

  it('ignores a load event that belongs to a picture it is no longer showing', async () => {
    const pane = mountImage('tfile:///preview/second.png')
    const image = pane.get('img').element as HTMLImageElement
    decodeAs(image, 1280, 720)

    // The element still carries the retired resource while the watcher has already cleared the
    // badge and Vue has not patched `src` yet, so the size it decoded is not the current one.
    image.setAttribute('src', 'tfile:///preview/first.png')
    await pane.get('img').trigger('load')

    expect(pane.find('.dimension-badge').exists()).toBe(false)
    expect(pane.find('.loading-overlay').exists()).toBe(true)
  })

  it('ignores a failure event that belongs to a picture it is no longer showing', async () => {
    const pane = mountImage('tfile:///preview/second.png')
    const image = pane.get('img').element as HTMLImageElement

    image.setAttribute('src', 'tfile:///preview/first.png')
    await pane.get('img').trigger('error')

    expect(pane.find('.error-state').exists()).toBe(false)
    expect(pane.find('.loading-overlay').exists()).toBe(true)
  })

  it('drops the previous picture size when a different file is previewed', async () => {
    const pane = mountImage('tfile:///preview/first.png')
    decodeAs(pane.get('img').element as HTMLImageElement, 1280, 720)
    await pane.get('img').trigger('load')
    expect(pane.find('.dimension-badge').exists()).toBe(true)

    await pane.setProps({ resourceUrl: 'tfile:///preview/second.png' })

    expect(pane.find('.dimension-badge').exists()).toBe(false)
    expect(pane.find('.loading-overlay').exists()).toBe(true)
  })
})
