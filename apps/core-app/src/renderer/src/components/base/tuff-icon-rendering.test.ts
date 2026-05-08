import { describe, expect, it } from 'vitest'
import { shouldRenderSvgAsMask } from './tuff-icon-rendering'

describe('tuff-icon-rendering', () => {
  it('renders currentColor svg as theme mask', () => {
    expect(
      shouldRenderSvgAsMask(
        '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h24v24H0z"/></svg>'
      )
    ).toBe(true)
  })

  it('renders default black svg as theme mask', () => {
    expect(shouldRenderSvgAsMask('<svg><path d="M0 0h24v24H0z"/></svg>')).toBe(true)
    expect(shouldRenderSvgAsMask('<svg><path fill="#000" d="M0 0h24v24H0z"/></svg>')).toBe(true)
  })

  it('keeps explicitly colorful svg as direct image', () => {
    expect(
      shouldRenderSvgAsMask(
        '<svg><rect fill="#0F172A"/><path stroke="#60A5FA" d="M0 0h24v24"/></svg>'
      )
    ).toBe(false)
  })
})
