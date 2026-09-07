import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RECOMMENDATION_BADGE,
  describeRecommendation,
  RECOMMENDATION_BADGES
} from './recommendation-presentation'

describe('describeRecommendation', () => {
  it('carries the badge for the source, so a tile written outside the scorer is still labelled', () => {
    // Pinned entries, the usage-ranked fallback and the "no reason recorded" default used to be
    // written as a bare `{ source }`; the renderer keys the badge off `meta.recommendation.badge`,
    // so those tiles sat blank under their titles next to neighbours reading "Frequent".
    expect(describeRecommendation('pinned')).toEqual({
      source: 'pinned',
      badge: RECOMMENDATION_BADGES.pinned
    })
    expect(describeRecommendation('frequent').badge.text).toBe(
      '$i18n:coreBox.recommendation.badge.frequent'
    )
  })

  it('has a badge for every source the scorer can record', () => {
    for (const badge of Object.values(RECOMMENDATION_BADGES)) {
      expect(badge.text.startsWith('$i18n:')).toBe(true)
      expect(badge.variant).toBeTruthy()
    }
    expect(RECOMMENDATION_BADGES['cold-start']).toBe(DEFAULT_RECOMMENDATION_BADGE)
  })
})
