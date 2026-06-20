import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('./[...slug].vue', import.meta.url), 'utf8')

describe('docs page performance boundaries', () => {
  it('keeps bottom engagement panels behind idle or near-viewport activation', () => {
    expect(page).toContain('shouldMountDocEngagementPanels')
    expect(page).toContain('docEngagementAnchorRef')
    expect(page).toContain('IntersectionObserver')
    expect(page).toContain('requestIdleCallback')
    expect(page).toContain('DOC_ENGAGEMENT_PANEL_DELAY_MS = 3200')
    expect(page).toContain('DOC_ENGAGEMENT_PANEL_IDLE_TIMEOUT_MS = 5000')
    expect(page).toMatch(/setTimeout\(\(\) => \{[\s\S]*IntersectionObserver[\s\S]*DOC_ENGAGEMENT_PANEL_DELAY_MS/)
    expect(page).toContain('<LazyDocsFeedback v-if="shouldMountDocEngagementPanels"')
    expect(page).toContain('<LazyDocsComments v-if="shouldMountDocEngagementPanels"')
  })

  it('keeps lightweight docs tracking separate from bottom engagement widgets', () => {
    expect(page).toContain('<LazyDocsEngagementClient')
    expect(page).toContain('v-if="shouldMountDocClientPanels"')
    expect(page).toContain('<LazyDocsFeedback v-if="shouldMountDocEngagementPanels"')
    expect(page).toContain('<LazyDocsComments v-if="shouldMountDocEngagementPanels"')
  })
})
