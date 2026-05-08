import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import TxImageGallery from '../src/TxImageGallery.vue'

const items = [
  { id: 'a', url: '/a.png', name: 'Alpha' },
  { id: 'b', url: '/b.png', name: 'Beta' },
  { id: 'c', url: '/c.png' },
]

describe('txImageGallery', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders thumbnails with image alt text and open labels', () => {
    const wrapper = mount(TxImageGallery, {
      props: { items },
    })

    const thumbs = wrapper.findAll('.tx-image-gallery__thumb')
    expect(thumbs).toHaveLength(3)
    expect(thumbs[0].attributes('aria-label')).toBe('Open Alpha preview')
    expect(thumbs[2].attributes('aria-label')).toBe('Open Image 3 preview')
    expect(wrapper.findAll('img').map(img => img.attributes('alt'))).toEqual(['Alpha', 'Beta', ''])
  })

  it('opens a modal at the clicked item and emits the selected item', async () => {
    const wrapper = mount(TxImageGallery, {
      props: { items },
      attachTo: document.body,
    })

    await wrapper.findAll('.tx-image-gallery__thumb')[1].trigger('click')
    await nextTick()

    expect(wrapper.emitted('open')?.[0]).toEqual([{ index: 1, item: items[1] }])
    expect(document.body.querySelector('.tx-modal__title')?.textContent).toBe('Beta')
    expect(document.body.querySelector<HTMLImageElement>('.tx-image-gallery__viewer img')?.getAttribute('src')).toBe('/b.png')
    expect(document.body.querySelector('.tx-image-gallery__count')?.textContent?.trim()).toBe('2 / 3')
  })

  it('navigates with boundary-disabled previous and next controls', async () => {
    const wrapper = mount(TxImageGallery, {
      props: { items },
      attachTo: document.body,
    })

    await wrapper.findAll('.tx-image-gallery__thumb')[0].trigger('click')
    await nextTick()

    const previous = () => document.body.querySelector<HTMLButtonElement>('[aria-label="Previous image"]')
    const next = () => document.body.querySelector<HTMLButtonElement>('[aria-label="Next image"]')
    const viewer = () => document.body.querySelector<HTMLImageElement>('.tx-image-gallery__viewer img')
    const count = () => document.body.querySelector('.tx-image-gallery__count')?.textContent?.trim()

    expect(previous()?.disabled).toBe(true)
    expect(next()?.disabled).toBe(false)

    next()?.click()
    await nextTick()
    expect(viewer()?.getAttribute('src')).toBe('/b.png')
    expect(count()).toBe('2 / 3')

    next()?.click()
    await nextTick()
    expect(viewer()?.getAttribute('src')).toBe('/c.png')
    expect(count()).toBe('3 / 3')
    expect(next()?.disabled).toBe(true)

    previous()?.click()
    await nextTick()
    expect(viewer()?.getAttribute('src')).toBe('/b.png')
    expect(count()).toBe('2 / 3')
  })

  it('does not open or emit for an empty list', async () => {
    const wrapper = mount(TxImageGallery, {
      props: { items: [] },
      attachTo: document.body,
    })

    expect(wrapper.findAll('.tx-image-gallery__thumb')).toHaveLength(0)
    expect(document.body.querySelector('.tx-modal__overlay')).toBeNull()
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('clamps startIndex updates and closes when the list becomes empty', async () => {
    const wrapper = mount(TxImageGallery, {
      props: {
        items,
        startIndex: 0,
      },
      attachTo: document.body,
    })

    await wrapper.findAll('.tx-image-gallery__thumb')[0].trigger('click')
    await nextTick()
    expect(document.body.querySelector('.tx-image-gallery__count')?.textContent?.trim()).toBe('1 / 3')

    await wrapper.setProps({ startIndex: 9 })
    await nextTick()
    expect(document.body.querySelector('.tx-image-gallery__count')?.textContent?.trim()).toBe('3 / 3')

    await wrapper.setProps({ items: [items[0]] })
    await nextTick()
    expect(document.body.querySelector('.tx-image-gallery__count')?.textContent?.trim()).toBe('1 / 1')

    await wrapper.setProps({ items: [] })
    await nextTick()
    expect(document.body.querySelector('.tx-modal__overlay')).toBeNull()
  })
})
