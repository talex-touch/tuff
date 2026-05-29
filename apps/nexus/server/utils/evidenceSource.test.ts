import { describe, expect, it } from 'vitest'
import {
  isFallbackEvidenceSource,
  isProductionEvidenceSource,
  normalizeEvidenceSource,
} from './evidenceSource'

describe('evidenceSource', () => {
  it('normalizes known source names and falls back to open', () => {
    expect(normalizeEvidenceSource('live')).toBe('live')
    expect(normalizeEvidenceSource('d1')).toBe('d1')
    expect(normalizeEvidenceSource('r2')).toBe('r2')
    expect(normalizeEvidenceSource('local-only')).toBe('local-only')
    expect(normalizeEvidenceSource('memory')).toBe('memory')
    expect(normalizeEvidenceSource('unknown')).toBe('open')
  })

  it('keeps production and fallback evidence classes separate', () => {
    expect(isProductionEvidenceSource('live')).toBe(true)
    expect(isProductionEvidenceSource('d1')).toBe(true)
    expect(isProductionEvidenceSource('r2')).toBe(true)
    expect(isProductionEvidenceSource('memory')).toBe(false)
    expect(isProductionEvidenceSource('local-only')).toBe(false)

    expect(isFallbackEvidenceSource('memory')).toBe(true)
    expect(isFallbackEvidenceSource('local-only')).toBe(true)
    expect(isFallbackEvidenceSource('d1')).toBe(false)
  })
})
