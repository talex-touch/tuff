import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import KeyframeStrokeText, { KeyframeStrokeText as InstalledKeyframeStrokeText } from '../index'

const originalGetBBox = SVGElement.prototype.getBBox
const originalGetComputedTextLength = SVGElement.prototype.getComputedTextLength

describe('txKeyframeStrokeText', () => {
  beforeEach(() => {
    SVGElement.prototype.getBBox = vi.fn(() => ({
      x: -2,
      y: -40,
      width: 160,
      height: 48,
    } as DOMRect))
    SVGElement.prototype.getComputedTextLength = vi.fn(() => 168)
  })

  afterEach(() => {
    SVGElement.prototype.getBBox = originalGetBBox
    SVGElement.prototype.getComputedTextLength = originalGetComputedTextLength
  })

  it('renders accessible stroke and fill text layers', async () => {
    const wrapper = mount(KeyframeStrokeText, {
      props: {
        text: 'TuffEx',
        strokeColor: '#0ea5e9',
        fillColor: '#0f172a',
        durationMs: 2400,
        strokeWidth: 3,
        fontSize: 42,
        fontWeight: 600,
        fontFamily: 'Inter',
      },
    })

    await nextTick()
    await nextTick()

    const svg = wrapper.find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('TuffEx')
    expect(svg.attributes('viewBox')).toBe('0 0 178 66')
    expect(svg.attributes('style')).toContain('--tx-kf-stroke-color: #0ea5e9;')
    expect(svg.attributes('style')).toContain('--tx-kf-fill-color: #0f172a;')
    expect(svg.attributes('style')).toContain('--tx-kf-duration: 2400ms;')
    expect(svg.attributes('style')).toContain('--tx-kf-stroke-width: 3;')
    expect(svg.attributes('style')).toContain('--tx-kf-stroke-length: 168;')
    expect(svg.attributes('style')).toContain('--tx-kf-font-size: 42px;')
    expect(svg.attributes('style')).toContain('--tx-kf-font-weight: 600;')
    expect(svg.attributes('style')).toContain('--tx-kf-font-family: Inter;')
    expect(wrapper.find('.tx-keyframe-stroke-text__stroke').text()).toBe('TuffEx')
    expect(wrapper.find('.tx-keyframe-stroke-text__fill').text()).toBe('TuffEx')
  })

  it('uses a non-breaking-space fallback for empty text', async () => {
    const wrapper = mount(KeyframeStrokeText)

    await nextTick()
    await nextTick()

    expect(wrapper.find('svg').attributes('aria-label')).toBeUndefined()
    expect(wrapper.find('.tx-keyframe-stroke-text__stroke').element.textContent).toBe('\u00A0')
  })

  it('updates metrics when measured props change', async () => {
    const wrapper = mount(KeyframeStrokeText, {
      props: {
        text: 'Before',
      },
    })

    await nextTick()
    await nextTick()
    await wrapper.setProps({ text: 'After', strokeWidth: 4 })
    await nextTick()

    expect(SVGElement.prototype.getBBox).toHaveBeenCalled()
    expect(SVGElement.prototype.getComputedTextLength).toHaveBeenCalled()
    expect(wrapper.find('.tx-keyframe-stroke-text__stroke').text()).toBe('After')
    expect(wrapper.find('svg').attributes('style')).toContain('--tx-kf-stroke-width: 4;')
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledKeyframeStrokeText.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxKeyframeStrokeText', InstalledKeyframeStrokeText)
  })
})
