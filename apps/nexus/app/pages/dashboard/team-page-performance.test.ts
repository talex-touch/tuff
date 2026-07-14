import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard team page performance boundary', () => {
  it('keeps team overlays and credit chart outside the first-visit synchronous import graph', () => {
    const page = readFileSync(new URL('./team.vue', import.meta.url), 'utf8')

    expect(page).toMatch(/import\s*\{[^}]*\bdefineAsyncComponent\b[^}]*\}\s*from ['"]vue['"]/s)
    expect(page).toContain("const LazyFlipDialog = defineAsyncComponent(() => import('~/components/base/dialog/FlipDialog.vue'))")
    expect(page).toContain("const LazyDashboardSparklineChart = defineAsyncComponent(() => import('~/components/dashboard/DashboardSparklineChart.client.vue'))")
    expect(page).toContain('<LazyDashboardSparklineChart')
    expect(page).toContain('<LazyFlipDialog')
    expect(page).toContain('v-if="createOverlayVisible"')
    expect(page).toContain('v-if="inviteOverlayVisible"')
    expect(page).toContain('v-if="activationOverlayVisible"')
    expect(page).toContain('v-if="disbandOverlayVisible"')
    expect(page).not.toContain("import FlipDialog from '~/components/base/dialog/FlipDialog.vue'")
    expect(page).not.toContain("import DashboardSparklineChart from '~/components/dashboard/DashboardSparklineChart.client.vue'")
    expect(page).not.toContain('<DashboardSparklineChart')
    expect(page).not.toContain('<FlipDialog')
  })
})
