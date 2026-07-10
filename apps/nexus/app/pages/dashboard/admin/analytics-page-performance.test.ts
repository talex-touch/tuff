import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard admin analytics page performance boundary', () => {
  it('keeps the geo analytics Leaflet map outside the first-visit synchronous import graph', () => {
    const page = readFileSync(new URL('./analytics.vue', import.meta.url), 'utf8')

    expect(page).toMatch(/import\s*\{[^}]*\bdefineAsyncComponent\b[^}]*\}\s*from ['"]vue['"]/s)
    expect(page).toContain("const LazyGeoLeafletMap = defineAsyncComponent(() => import('~/components/dashboard/GeoLeafletMap.client.vue'))")
    expect(page).toContain('<LazyGeoLeafletMap')
    expect(page).not.toContain("import GeoLeafletMap from '~/components/dashboard/GeoLeafletMap.client.vue'")
    expect(page).not.toContain('<GeoLeafletMap')

    const mapIsGuardedByGeoAnalytics = /<template\s+v-else-if="geoAnalytics"[^>]*>[\s\S]*?<LazyGeoLeafletMap\b/.test(page)
      || /<LazyGeoLeafletMap\b[^>]*\bv-if="geoAnalytics"/.test(page)

    expect(mapIsGuardedByGeoAnalytics).toBe(true)
  })
})
