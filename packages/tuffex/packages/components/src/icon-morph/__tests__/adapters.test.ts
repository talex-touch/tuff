import { describe, expect, it, vi } from 'vitest'
import { canvasTarget, maskTarget, svgToIcon } from '../src/engine'

describe('icon-morph adapters: svgToIcon', () => {
  it('converts stroke SVG markup into IconNode', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `
    const icon = svgToIcon(svg)
    expect(typeof icon === 'string').toBe(true)
    if (typeof icon === 'string') {
      expect(icon.startsWith('M')).toBe(true)
      expect(icon).toContain('C')
    }
  })

  it('rejects non-stroke filled icons', () => {
    const filledSvg = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'
    expect(() => svgToIcon(filledSvg)).toThrow(/only stroke-centerline icons morph/)
  })

  it('strips non-rendered containers like <defs>', () => {
    const svg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <defs><filter id="f"><feGaussianBlur /></filter></defs>
        <circle cx="12" cy="12" r="8"/>
      </svg>
    `
    const icon = svgToIcon(svg)
    expect(typeof icon === 'string').toBe(true)
    if (typeof icon === 'string') {
      expect(icon.startsWith('M')).toBe(true)
      expect(icon).toContain('C')
    }
  })
})

describe('icon-morph adapters: maskTarget', () => {
  it('attaches double-buffered mask layers to element style and flips on write', () => {
    const fakeEl = {
      style: {
        maskImage: '',
        webkitMaskImage: '',
        backgroundColor: '',
      },
    }

    const target = maskTarget(fakeEl)
    expect(fakeEl.style.maskImage).toMatch(/^url\(#morphicons-mask-\d+\)$/)
    expect(fakeEl.style.backgroundColor).toBe('currentColor')

    const initialMask = fakeEl.style.maskImage
    target.setAttribute('d', 'M0 0L10 10')
    const flippedMask = fakeEl.style.maskImage
    expect(flippedMask).not.toBe(initialMask)
    expect(flippedMask).toMatch(/^url\(#morphicons-mask-\d+\)$/)

    target.dispose()
  })
})
describe('icon-morph adapters: canvasTarget', () => {
  it('calls 2D context methods and onWrite callback', () => {
    class MockPath2D {
      d: string
      constructor(d = '') {
        this.d = d
      }
    }
    vi.stubGlobal('Path2D', MockPath2D)
    const mockCtx = {
      canvas: { width: 100, height: 100 },
      lineWidth: 1,
      lineCap: '',
      lineJoin: '',
      strokeStyle: '',
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      stroke: vi.fn(),
    }

    const onWrite = vi.fn()
    const target = canvasTarget(mockCtx, { onWrite, color: '#ff0000' })
    target.setAttribute('d', 'M10 10L20 20')

    expect(mockCtx.clearRect).toHaveBeenCalled()
    expect(mockCtx.setTransform).toHaveBeenCalled()
    expect(mockCtx.strokeStyle).toBe('#ff0000')
    expect(onWrite).toHaveBeenCalled()
  })
})
