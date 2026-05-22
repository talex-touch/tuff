import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('PluginDetailDrawer analytics contract', () => {
  it('renders owner review analytics from private plugin analytics payload', () => {
    const component = readFileSync(new URL('./PluginDetailDrawer.vue', import.meta.url), 'utf8')

    expect(component).toContain('analytics.reviews?.total')
    expect(component).toContain("dashboard.sections.plugins.analytics.stats.reviews")
    expect(component).toContain("dashboard.sections.plugins.analytics.reviews.title")
    expect(component).toContain("dashboard.sections.plugins.analytics.reviews.averageMeta")
    expect(component).toContain("dashboard.sections.plugins.analytics.reviews.noRatings")
    expect(component).toContain('reviewAnalytics.ratingDistribution')
    expect(component).toContain('latestReviewTrendPoint')
    expect(component).toContain('reviewAnalytics.value?.statusTrend')
    expect(component).toContain('formatReviewTrendMeta')
    expect(component).toContain("dashboard.sections.plugins.analytics.reviews.trendMeta")
    expect(component).toContain('analyticsConversionItems')
    expect(component).toContain('analytics?.conversion')
    expect(component).toContain('latestConversionTrendPoint')
    expect(component).toContain('analytics?.conversionTrend')
    expect(component).toContain('formatConversionTrendMeta')
    expect(component).toContain("dashboard.sections.plugins.analytics.conversion.title")
    expect(component).toContain("dashboard.sections.plugins.analytics.conversion.installRate")
    expect(component).toContain("dashboard.sections.plugins.analytics.conversion.trendMeta")
  })
})
