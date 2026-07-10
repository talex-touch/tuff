import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard overview page performance boundary', () => {
  it('keeps chart and map clients outside the first-visit synchronous import graph', () => {
    const page = readFileSync(new URL('./overview.vue', import.meta.url), 'utf8')

    expect(page).toMatch(/import\s*\{[^}]*\bdefineAsyncComponent\b[^}]*\}\s*from ['"]vue['"]/s)
    expect(page).toContain("const LazyDashboardSparklineChart = defineAsyncComponent(() => import('~/components/dashboard/DashboardSparklineChart.client.vue'))")
    expect(page).toContain("const LazyGeoLeafletMap = defineAsyncComponent(() => import('~/components/dashboard/GeoLeafletMap.client.vue'))")
    expect(page).toContain('<LazyDashboardSparklineChart')
    expect(page).toContain('<LazyGeoLeafletMap')
    expect(page).not.toContain("import DashboardSparklineChart from '~/components/dashboard/DashboardSparklineChart.client.vue'")
    expect(page).not.toContain("import GeoLeafletMap from '~/components/dashboard/GeoLeafletMap.client.vue'")
    expect(page).not.toContain('<DashboardSparklineChart')
    expect(page).not.toContain('<GeoLeafletMap')
  })
})
