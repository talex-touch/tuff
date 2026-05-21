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
  })
})
