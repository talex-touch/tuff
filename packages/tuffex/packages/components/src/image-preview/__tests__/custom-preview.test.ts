import type { PropType } from 'vue'
import type { ImagePreviewItem, ImagePreviewMinimapSlotProps, ImagePreviewSlotProps, ImagePreviewThumbnailSlotProps } from '../src/types'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, markRaw } from 'vue'
import TxImagePreview from '../src/TxImagePreview.vue'

const diagram = {
  type: 'custom' as const,
  name: 'Custom Diagram',
  raw: '<svg viewBox="0 0 1200 800"><text>Diagram content</text></svg>',
  width: 1200,
  height: 800,
}

const shownSlide = () => document.body.querySelector<HTMLElement>('.tx-image-preview__slide:not([aria-hidden])')!
const control = (label: string) => document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!

beforeEach(() => {
  // jsdom has no layout. Supply only the stage and fit-box measurements read by the preview.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__stage') ? 1000 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__stage') ? 800 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__fit') ? 600 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__fit') ? 400 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__fit') ? 200 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__fit') ? 150 : 0
  })
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

// Vitest runs after hooks in reverse order: unmount before restoring layout and removing Teleports.
enableAutoUnmount(afterEach)

describe('txImagePreview custom content', () => {
  it('opens a URL-less custom SVG immediately without an image load or broken-image placeholder', async () => {
    mount(TxImagePreview, {
      props: {
        open: true,
        items: [{ type: 'custom', name: 'Custom Diagram', raw: diagram.raw }],
        label: 'Expanded diagram',
      },
      attachTo: document.body,
    })
    await flushPromises()

    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-label')).toContain('Custom Diagram')
    expect(shownSlide().querySelector('.tx-image-preview__frame .tx-image-preview__custom.is-loaded svg')?.textContent).toBe('Diagram content')
    expect(shownSlide().querySelector('img')).toBeNull()
    expect(shownSlide().querySelector('.tx-image-preview__placeholder, .tx-image-preview__failed')).toBeNull()
  })

  it('renders a URL-less component from its item and payload without waiting for image loading', async () => {
    const component = markRaw(defineComponent({
      props: {
        item: { type: Object as PropType<ImagePreviewItem>, required: true },
        payload: { type: Object as PropType<{ nodes: string[] }>, required: true },
      },
      setup(props) {
        return () => h('section', { class: 'component-diagram' }, [
          h('h2', props.item.name),
          h('ol', props.payload.nodes.map(node => h('li', node))),
        ])
      },
    }))
    mount(TxImagePreview, {
      props: {
        open: true,
        items: [{ type: 'custom', name: 'Component Diagram', component, payload: { nodes: ['Start', 'Finish'] } }],
      },
      attachTo: document.body,
    })
    await flushPromises()

    const content = shownSlide().querySelector('.tx-image-preview__custom.is-loaded .component-diagram')!
    expect(content.querySelector('h2')?.textContent).toBe('Component Diagram')
    expect(Array.from(content.querySelectorAll('li'), node => node.textContent)).toEqual(['Start', 'Finish'])
    expect(shownSlide().querySelector('img, .tx-image-preview__placeholder, .tx-image-preview__failed')).toBeNull()
  })

  it.each([
    { name: 'URL string', image: '/legacy-diagram.png' },
    { name: 'image descriptor', image: { url: '/legacy-diagram.png', name: 'Legacy Diagram' } },
  ])('keeps a legacy $name pending until its load event in a mixed images list', async ({ image }) => {
    const wrapper = mount(TxImagePreview, {
      props: {
        open: true,
        images: [diagram, image],
        zoomInLabel: 'Enlarge diagram',
      },
      attachTo: document.body,
    })
    await flushPromises()
    expect(shownSlide().querySelector('.tx-image-preview__custom.is-loaded svg')?.textContent).toBe('Diagram content')

    await wrapper.setProps({ index: 1 })
    await flushPromises()
    const picture = shownSlide().querySelector<HTMLImageElement>('.tx-image-preview__image')!
    expect(picture.getAttribute('src')).toBe('/legacy-diagram.png')
    expect(picture.classList.contains('is-loaded')).toBe(false)
    expect(control('Enlarge diagram').getAttribute('aria-disabled')).toBe('true')

    vi.spyOn(picture, 'naturalWidth', 'get').mockReturnValue(1600)
    vi.spyOn(picture, 'naturalHeight', 'get').mockReturnValue(1000)
    picture.dispatchEvent(new Event('load'))
    await flushPromises()

    expect(picture.classList.contains('is-loaded')).toBe(true)
    expect(control('Enlarge diagram').hasAttribute('aria-disabled')).toBe(false)
    expect(shownSlide().querySelector('.tx-image-preview__custom, .tx-image-preview__failed')).toBeNull()
  })

  it.each(['default', 'item'] as const)('renders the #%s slot with the selected item and live pan/zoom state', async (slot) => {
    mount(TxImagePreview, {
      props: {
        open: true,
        items: [diagram],
        zoomInLabel: 'Enlarge diagram',
      },
      slots: {
        [slot]: ({ item, index, scale, view }: ImagePreviewSlotProps) => h('article', {
          'class': 'custom-diagram',
          'data-scale': scale,
          'data-pan-x': view.tx,
        }, `${item.name}:${index}:${item.raw}`),
      },
      attachTo: document.body,
    })
    await flushPromises()

    const markup = () => shownSlide().querySelector<HTMLElement>('.custom-diagram')!
    const frame = shownSlide().querySelector<HTMLElement>('.tx-image-preview__frame')!
    expect(markup().textContent).toBe(`Custom Diagram:0:${diagram.raw}`)
    const fitScale = Number(markup().dataset.scale)
    expect(fitScale).toBeCloseTo(600 / diagram.width)
    const fittedTransform = frame.style.transform

    control('Enlarge diagram').click()
    await flushPromises()

    expect(Number(markup().dataset.scale)).toBeGreaterThan(fitScale)
    expect(frame.style.transform).not.toBe(fittedTransform)

    // Enlarge beyond the stage width so horizontal panning is not clamped to the centre.
    control('Enlarge diagram').click()
    control('Enlarge diagram').click()
    await flushPromises()
    const zoomedScale = Number(markup().dataset.scale)
    const panStart = Number(markup().dataset.panX)
    const zoomedTransform = frame.style.transform

    document.body.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    }))
    await flushPromises()

    expect(Number(markup().dataset.panX)).toBeGreaterThan(panStart)
    expect(Number(markup().dataset.scale)).toBe(zoomedScale)
    expect(frame.style.transform).not.toBe(zoomedTransform)
  })

  it('renders thumbnail item/index/current props and moves the selected content when a thumbnail is clicked', async () => {
    const second = { ...diagram, name: 'Second Diagram', raw: '<svg><text>Second content</text></svg>' }
    const wrapper = mount(TxImagePreview, {
      props: {
        open: true,
        items: [diagram, second],
        indicator: 'thumbnails',
      },
      slots: {
        item: ({ item, index }: ImagePreviewSlotProps) => h('article', { class: 'selected-diagram' }, `${index}:${item.name}`),
        thumbnail: ({ item, index, current }: ImagePreviewThumbnailSlotProps) => h('span', {
          'class': 'diagram-thumbnail',
          'data-current': String(current),
        }, `${index}:${item.name}`),
      },
      attachTo: document.body,
    })
    await flushPromises()

    const thumbnails = () => Array.from(document.body.querySelectorAll<HTMLElement>('.tx-image-preview__strip .diagram-thumbnail'))
    expect(thumbnails().map(node => [node.textContent, node.dataset.current])).toEqual([
      ['0:Custom Diagram', 'true'],
      ['1:Second Diagram', 'false'],
    ])
    expect(shownSlide().querySelector('.selected-diagram')?.textContent).toBe('0:Custom Diagram')

    thumbnails()[1]!.closest('button')!.click()
    await flushPromises()

    expect(shownSlide().querySelector('.selected-diagram')?.textContent).toBe('1:Second Diagram')
    expect(thumbnails().map(node => node.dataset.current)).toEqual(['false', 'true'])
    expect(wrapper.emitted('update:index')).toEqual([[1]])
  })

  it('renders minimap item/index/view/stage/turns props for the zoomed, rotated custom content', async () => {
    mount(TxImagePreview, {
      props: {
        open: true,
        items: [diagram],
        minimap: true,
        actions: ['rotate'],
        rotateLabel: 'Turn diagram',
        zoomInLabel: 'Enlarge diagram',
      },
      slots: {
        minimap: ({ item, index, view, stage, turns }: ImagePreviewMinimapSlotProps) => h('output', {
          class: 'diagram-minimap',
        }, JSON.stringify({ name: item.name, raw: item.raw, index, view, stage, turns })),
      },
      attachTo: document.body,
    })
    await flushPromises()

    control('Turn diagram').click()
    await flushPromises()
    control('Enlarge diagram').click()
    await flushPromises()

    const minimap = () => JSON.parse(document.body.querySelector('.diagram-minimap')!.textContent!)
    const first = minimap()
    expect(first).toMatchObject({
      name: diagram.name,
      raw: diagram.raw,
      index: 0,
      stage: { width: 1000, height: 800 },
      turns: 1,
    })
    // A quarter-turn swaps the natural dimensions; the zoomed view must still be centred.
    expect(first.view.k).toBeGreaterThan(400 / diagram.width)
    expect(first.view.tx).toBeCloseTo(500 - diagram.height * first.view.k / 2)
    expect(first.view.ty).toBeCloseTo(350 - diagram.width * first.view.k / 2)

    control('Enlarge diagram').click()
    await flushPromises()

    expect(minimap().view.k).toBeGreaterThan(first.view.k)
    expect(minimap().turns).toBe(1)
  })
})
