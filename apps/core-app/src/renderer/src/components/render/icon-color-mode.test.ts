import { describe, expect, it } from 'vitest'
import {
  normalizeCoreBoxIcon,
  resolveCoreBoxIconColor,
  shouldRenderCoreBoxIconColorful
} from './icon-color-mode'

describe('corebox icon color mode', () => {
  it('normalizes CoreBox icons without dropping color metadata', () => {
    expect(normalizeCoreBoxIcon('i-ri-clipboard-line')).toEqual({
      type: 'class',
      value: 'i-ri-clipboard-line',
      status: 'normal'
    })
    expect(normalizeCoreBoxIcon('ri-translate-2')).toEqual({
      type: 'class',
      value: 'i-ri-translate-2',
      status: 'normal'
    })
    expect(normalizeCoreBoxIcon('ri:json-line')).toEqual({
      type: 'class',
      value: 'i-ri-json-line',
      status: 'normal'
    })
    expect(normalizeCoreBoxIcon('/icons/tool.svg')).toEqual({
      type: 'url',
      value: '/icons/tool.svg',
      status: 'normal'
    })
    expect(
      normalizeCoreBoxIcon({
        type: 'file',
        value: 'assets/logo.svg',
        color: 'var(--tx-color-primary)',
        colorful: true,
        error: 'failed'
      })
    ).toEqual({
      type: 'file',
      value: 'assets/logo.svg',
      status: 'normal',
      color: 'var(--tx-color-primary)',
      colorful: true,
      error: 'failed'
    })
  })

  it('defaults CoreBox result icons to theme color', () => {
    expect(shouldRenderCoreBoxIconColorful(undefined)).toBe(false)
    expect(shouldRenderCoreBoxIconColorful('i-ri-translate-2')).toBe(false)
    expect(shouldRenderCoreBoxIconColorful({ type: 'file', value: 'assets/logo.svg' })).toBe(false)
    expect(resolveCoreBoxIconColor(undefined)).toBe('var(--tx-text-color-primary, #e5e7eb)')
    expect(resolveCoreBoxIconColor('i-ri-translate-2')).toBe(
      'var(--tx-text-color-primary, #e5e7eb)'
    )
  })

  it('uses a visible fallback icon when icon metadata is missing', () => {
    expect(normalizeCoreBoxIcon(undefined)).toEqual({
      type: 'class',
      value: 'i-ri-puzzle-line',
      status: 'normal'
    })
    expect(normalizeCoreBoxIcon({ type: 'url', value: '' })).toEqual({
      type: 'class',
      value: 'i-ri-puzzle-line',
      status: 'normal'
    })
  })

  it('uses explicit icon color when provided', () => {
    expect(
      resolveCoreBoxIconColor({ type: 'class', value: 'i-ri-clipboard-line', color: '#22c55e' })
    ).toBe('#22c55e')
  })

  it('preserves original colors only when explicitly requested', () => {
    expect(
      shouldRenderCoreBoxIconColorful({ type: 'file', value: 'assets/logo.svg', colorful: true })
    ).toBe(true)
    expect(
      shouldRenderCoreBoxIconColorful({ type: 'url', value: '/icon.svg', colorful: false })
    ).toBe(false)
  })
})
