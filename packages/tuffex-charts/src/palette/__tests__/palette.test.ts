import { describe, expect, it } from 'vitest'
import { CHART_DARK_COLORS, CHART_LIGHT_COLORS, ChartPalette } from '../index'

describe('chartPalette', () => {
  it('matches the kumo categorical palette in both modes', () => {
    expect(CHART_LIGHT_COLORS).toEqual(['#4290F0', '#F5B647', '#E8649D', '#8D58EE', '#50C3B6', '#D37536'])
    // Only Yellow differs in dark mode.
    expect(CHART_DARK_COLORS).toEqual(['#4290F0', '#EEB720', '#E8649D', '#8D58EE', '#50C3B6', '#D37536'])
  })

  it('wraps categorical indices modulo the palette length', () => {
    expect(ChartPalette.categorical(0)).toBe('#4290F0')
    expect(ChartPalette.categorical(6)).toBe('#4290F0')
    expect(ChartPalette.categorical(7, true)).toBe('#EEB720')
  })

  it('emits var() references with a light-mode fallback', () => {
    expect(ChartPalette.categoricalVar(0)).toBe('var(--tx-chart-categorical-1, #4290F0)')
    expect(ChartPalette.categoricalVar(6)).toBe('var(--tx-chart-categorical-1, #4290F0)')
    expect(ChartPalette.categoricalVar(4)).toBe('var(--tx-chart-categorical-5, #50C3B6)')
  })

  it('resolves semantic colors per mode (kumo values)', () => {
    expect(ChartPalette.semantic('Attention')).toBe('#FC574A')
    expect(ChartPalette.semantic('Attention', true)).toBe('#FC574A')
    expect(ChartPalette.semantic('Neutral')).toBe('#B9D6FF')
    expect(ChartPalette.semantic('Neutral', true)).toBe('#8EC5FF')
    expect(ChartPalette.semantic('Skeleton')).toBe('#DDDDDD')
    expect(ChartPalette.semantic('Skeleton', true)).toBe('#5C5C5C')
  })

  it('returns sequential ramps as fresh arrays (mutation-safe)', () => {
    const light = ChartPalette.sequential('blues')
    expect(light).toEqual(['#E1EAF4', '#8EBCF6', '#4290F0', '#0E58B4', '#03254F'])
    light.push('mutated')
    expect(ChartPalette.sequential('blues')).toHaveLength(5)
    // Dark is direction-reversed with a dark-tuned step 4, not a mirror copy.
    expect(ChartPalette.sequential('blues', true)).toEqual(['#03254F', '#0E58B4', '#4290F0', '#A6BFDD', '#E1EAF4'])
  })

  it('swaps text colors between modes', () => {
    expect(ChartPalette.text('primary')).toBe('#6B7280')
    expect(ChartPalette.text('primary', true)).toBe('#9CA3AF')
    expect(ChartPalette.text('secondary')).toBe('#9CA3AF')
    expect(ChartPalette.text('secondary', true)).toBe('#6B7280')
  })

  it('assembles map colors from area, categorical bubble and scale ramp', () => {
    const light = ChartPalette.mapColors()
    expect(light.area).toBe('#E5E7EB')
    expect(light.bubble).toBe(ChartPalette.categorical(0))
    expect(light.scale).toEqual(['#C8DEFB', '#8FBDF6', '#4290F0', '#1E60BE', '#0A3A7A'])

    const dark = ChartPalette.mapColors(true)
    expect(dark.area).toBe('#2B2C31')
    expect(dark.scale).toEqual(['#26456C', '#2C68BE', '#4290F0', '#79AEF4', '#BBD6FA'])

    light.scale.push('mutated')
    expect(ChartPalette.mapColors().scale).toHaveLength(5)
  })
})
