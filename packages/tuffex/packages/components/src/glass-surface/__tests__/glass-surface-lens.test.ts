import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TxGlassSurface from '../src/TxGlassSurface.vue'

const FIELD = 'data:image/png;base64,FIELD'

let frames: Array<() => void> = []
let toDataURL: ReturnType<typeof vi.fn>

function flushFrames(): void {
  const run = frames
  frames = []
  run.forEach(callback => callback())
}

/** A 2D context that takes any drawing call, the classic engine's gradients included. */
function canvasContext(): CanvasRenderingContext2D {
  const context: Record<string | symbol, unknown> = { putImageData: vi.fn() }
  return new Proxy(context, {
    get: (target, key) => (key in target ? target[key] : () => ({ addColorStop: () => {} })),
  }) as unknown as CanvasRenderingContext2D
}

/** A browser that can refract: Chromium's `CSS.supports`, a 2D canvas, and layout that reports a size. */
function stubChromium({ supported = true, width = 210, height = 150 } = {}): void {
  vi.stubGlobal('CSS', { supports: () => supported })
  vi.stubGlobal('ImageData', class {
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  })
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  toDataURL = vi.fn(() => FIELD)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(canvasContext)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toDataURL as () => string)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height)
}

// The drawn images are cached by shape, so each test uses a lens size of its own.
describe('txGlassSurface lens engine', () => {
  beforeEach(() => {
    frames = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('refracts through a drawn field where the browser can', async () => {
    stubChromium({ width: 211, height: 151 })
    const wrapper = mount(TxGlassSurface, { props: { engine: 'lens', width: 211, height: 151, borderRadius: 75 } })
    await wrapper.vm.$nextTick()

    expect(wrapper.classes()).toContain('tx-glass-surface--lens')
    expect(wrapper.classes()).toContain('is-refracting')

    const filter = wrapper.find('filter')
    expect(filter.exists()).toBe(true)
    const id = filter.attributes('id')!
    // jsdom does not serialize `backdrop-filter`, so it is read off the style object Vue wrote it to.
    expect((wrapper.element as HTMLElement).style.backdropFilter).toBe(`url(#${id})`)
    expect(wrapper.attributes('style')).toContain(`background-image: url("${FIELD}")`)

    expect(wrapper.find('feImage').attributes('href')).toBe(FIELD)
    const maps = wrapper.findAll('feDisplacementMap')
    expect(maps).toHaveLength(1)
    expect(Number(maps[0]!.attributes('scale'))).toBeGreaterThan(0)
    expect(maps[0]!.attributes('xChannelSelector')).toBe('R')
    expect(maps[0]!.attributes('yChannelSelector')).toBe('G')
    expect(wrapper.find('feColorMatrix[type="saturate"]').attributes('values')).toBe('1.5')
  })

  it('magnifies the face in a pass of its own, which the rim then reads', async () => {
    stubChromium({ width: 222, height: 162 })
    const wrapper = mount(TxGlassSurface, { props: { engine: 'lens', zoom: 1.2 } })
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('feImage')).toHaveLength(2)
    const [magnify, bend] = wrapper.findAll('feDisplacementMap')
    expect(magnify!.attributes('in')).toBe('SourceGraphic')
    expect(magnify!.attributes('result')).toBe('magnified')
    expect(bend!.attributes('in')).toBe('magnified')
    // Gentle on its own, so it does not share a scale with the rim's peak.
    expect(Number(magnify!.attributes('scale'))).toBeLessThan(Number(bend!.attributes('scale')))
  })

  it('draws the filter in px over the lens, which a 0px SVG could not resolve percentages for', async () => {
    stubChromium({ width: 223, height: 163 })
    const wrapper = mount(TxGlassSurface, { props: { engine: 'lens' } })
    await wrapper.vm.$nextTick()

    const filter = wrapper.find('filter')
    expect(filter.attributes('filterUnits')).toBe('userSpaceOnUse')
    expect(filter.attributes('primitiveUnits')).toBe('userSpaceOnUse')
    expect([filter.attributes('width'), filter.attributes('height')]).toEqual(['223', '163'])
    const image = wrapper.find('feImage')
    expect([image.attributes('x'), image.attributes('y'), image.attributes('width'), image.attributes('height')]).toEqual(['0', '0', '223', '163'])
  })

  it('gives every lens a filter of its own', async () => {
    stubChromium({ width: 212, height: 152 })
    const first = mount(TxGlassSurface, { props: { engine: 'lens' } })
    const second = mount(TxGlassSurface, { props: { engine: 'lens' } })
    await first.vm.$nextTick()

    expect(first.find('filter').attributes('id')).not.toBe(second.find('filter').attributes('id'))
  })

  it('is frosted glass where SVG filters cannot run', async () => {
    stubChromium({ supported: false, width: 213, height: 153 })
    const wrapper = mount(TxGlassSurface, { props: { engine: 'lens', frost: 4 } })
    await wrapper.vm.$nextTick()

    expect(wrapper.classes()).not.toContain('is-refracting')
    expect(wrapper.find('filter').exists()).toBe(false)
    expect((wrapper.element as HTMLElement).style.backdropFilter).toBeFalsy()
    expect(wrapper.attributes('style')).toContain('/ 0.22)')
    expect(wrapper.attributes('style')).toContain('--tx-glass-frost: 4px')
  })

  it('stays frosted when there is no canvas to draw the field on', async () => {
    stubChromium({ width: 214, height: 154 })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const wrapper = mount(TxGlassSurface, { props: { engine: 'lens' } })
    await wrapper.vm.$nextTick()

    expect(wrapper.classes()).not.toContain('is-refracting')
    expect(wrapper.find('filter').exists()).toBe(false)
  })

  it('splits the channels apart when asked to disperse', async () => {
    stubChromium({ width: 215, height: 155 })
    const wrapper = mount(TxGlassSurface, { props: { engine: 'lens', dispersion: 0.2 } })
    await wrapper.vm.$nextTick()

    const scales = wrapper.findAll('feDisplacementMap').map(map => Number(map.attributes('scale')))
    expect(scales).toHaveLength(3)
    expect(scales[0]!).toBeLessThan(scales[1]!)
    expect(scales[1]!).toBeLessThan(scales[2]!)
    expect(scales[1]! - scales[0]!).toBeCloseTo(scales[2]! - scales[1]!, 6)
  })

  it('turns the edge vivid when the rim saturation is above 1', async () => {
    stubChromium({ width: 216, height: 156 })
    const plain = mount(TxGlassSurface, { props: { engine: 'lens' } })
    const vivid = mount(TxGlassSurface, { props: { engine: 'lens', rimSaturation: 6 } })
    await plain.vm.$nextTick()

    expect(plain.find('feComposite[result="vividRim"]').exists()).toBe(false)
    expect(vivid.find('feComposite[result="vividRim"]').exists()).toBe(true)
    expect(vivid.findAll('feColorMatrix[type="saturate"]').map(node => node.attributes('values'))).toEqual(['1.5', '6'])
  })

  it('softens only what the rim bends, and all of it where the face is magnified', async () => {
    stubChromium({ width: 224, height: 164 })
    const flat = mount(TxGlassSurface, { props: { engine: 'lens' } })
    const magnified = mount(TxGlassSurface, { props: { engine: 'lens', zoom: 1.2 } })
    await flat.vm.$nextTick()

    // A flat face stays as sharp as the page: the blur is blended in only where the map is not neutral.
    expect(flat.find('feGaussianBlur').attributes('result')).toBe('soft')
    expect(flat.find('feComposite[result="settled"]').attributes('operator')).toBe('arithmetic')
    // The zoom resamples the whole face, so all of it is softened.
    expect(magnified.find('feGaussianBlur').attributes('result')).toBe('settled')
    expect(magnified.find('feComposite[result="settled"]').exists()).toBe(false)
  })

  it('redraws once per frame however many props change', async () => {
    stubChromium({ width: 217, height: 157 })
    const wrapper = mount(TxGlassSurface, { props: { engine: 'lens' } })
    await wrapper.vm.$nextTick()
    const before = Number(wrapper.find('feDisplacementMap').attributes('scale'))
    const drawn = toDataURL.mock.calls.length

    await wrapper.setProps({ thickness: 30 })
    await wrapper.setProps({ ior: 2 })
    await wrapper.setProps({ zoom: 1.4 })
    expect(toDataURL.mock.calls.length).toBe(drawn)
    expect(frames).toHaveLength(1)

    flushFrames()
    await wrapper.vm.$nextTick()
    // One new field and the first magnification map for the three changes together; the rim does not depend on any of them, so it is reused.
    expect(toDataURL.mock.calls.length).toBe(drawn + 2)
    expect(Number(wrapper.find('feDisplacementMap').attributes('scale'))).toBeGreaterThan(before)
  })

  it('reuses the field it has drawn for the same lens', async () => {
    stubChromium({ width: 218, height: 158 })
    const first = mount(TxGlassSurface, { props: { engine: 'lens' } })
    await first.vm.$nextTick()
    const drawn = toDataURL.mock.calls.length

    const second = mount(TxGlassSurface, { props: { engine: 'lens' } })
    await second.vm.$nextTick()
    expect(toDataURL.mock.calls.length).toBe(drawn)
  })

  it('changes the rim image, not the field, when only the rim light changes', async () => {
    stubChromium({ width: 219, height: 159 })
    const wrapper = mount(TxGlassSurface, { props: { engine: 'lens' } })
    await wrapper.vm.$nextTick()
    const drawn = toDataURL.mock.calls.length

    await wrapper.setProps({ rimLight: 2 })
    flushFrames()
    await wrapper.vm.$nextTick()
    expect(toDataURL.mock.calls.length).toBe(drawn + 1)
  })

  it('leaves the classic engine alone', async () => {
    stubChromium({ width: 220, height: 160 })
    const wrapper = mount(TxGlassSurface)
    await wrapper.vm.$nextTick()

    expect(wrapper.classes()).not.toContain('tx-glass-surface--lens')
    expect(wrapper.findAll('feDisplacementMap')).toHaveLength(3)
    expect(frames).toHaveLength(0)
  })

  it('falls back to the classic filter when the engine is switched back', async () => {
    stubChromium({ width: 221, height: 161 })
    const wrapper = mount(TxGlassSurface, { props: { engine: 'lens' } })
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('feDisplacementMap')).toHaveLength(1)

    await wrapper.setProps({ engine: 'classic' })
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('tx-glass-surface--lens')
    expect(wrapper.findAll('feDisplacementMap')).toHaveLength(3)
  })
})
