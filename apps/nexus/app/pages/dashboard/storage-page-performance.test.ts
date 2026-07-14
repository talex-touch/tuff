import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard storage page performance boundary', () => {
  it('keeps details dialog and charts outside the first-visit synchronous import graph', () => {
    const page = readFileSync(new URL('./storage.vue', import.meta.url), 'utf8')

    expect(page).toMatch(/import\s*\{[^}]*\bdefineAsyncComponent\b[^}]*\}\s*from ['"]vue['"]/s)
    expect(page).toContain("const LazyFlipDialog = defineAsyncComponent(() => import('~/components/base/dialog/FlipDialog.vue'))")
    expect(page).toContain("const LazyDashboardSparklineChart = defineAsyncComponent(() => import('~/components/dashboard/DashboardSparklineChart.client.vue'))")
    expect(page).toContain('<LazyDashboardSparklineChart')
    expect(page).toContain('<LazyFlipDialog')
    expect(page).toContain('v-if="showDetailsOverlay"')
    expect(page).not.toContain("import FlipDialog from '~/components/base/dialog/FlipDialog.vue'")
    expect(page).not.toContain("import DashboardSparklineChart from '~/components/dashboard/DashboardSparklineChart.client.vue'")
    expect(page).not.toContain('<DashboardSparklineChart')
    expect(page).not.toContain('<FlipDialog')
  })
})
