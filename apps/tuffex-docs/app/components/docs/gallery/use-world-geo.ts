import type { MapGeoJson } from '@talex-touch/tuffex/charts/src/maps'
import { onMounted, shallowRef } from 'vue'
import { MINI_WORLD_GEO } from '../mini-world-geo'

let cachedWorldGeo: MapGeoJson | null = null
let pendingWorldGeo: Promise<MapGeoJson | null> | null = null

function loadWorldGeo(url: string): Promise<MapGeoJson | null> {
  if (cachedWorldGeo)
    return Promise.resolve(cachedWorldGeo)
  if (pendingWorldGeo)
    return pendingWorldGeo

  const fetchGeo = $fetch as (target: string) => Promise<MapGeoJson>
  pendingWorldGeo = fetchGeo(url)
    .then((data) => {
      cachedWorldGeo = data
      return data
    })
    .catch(() => null)
    .finally(() => {
      pendingWorldGeo = null
    })

  return pendingWorldGeo
}

/**
 * Loads the vendored full world GeoJSON once per client session, starting with
 * the inlined MINI_WORLD_GEO silhouette so specimens render immediately with
 * zero layout jump and gracefully survive offline mode.
 */
export function useWorldGeo() {
  const geo = shallowRef<MapGeoJson>(cachedWorldGeo ?? MINI_WORLD_GEO)

  onMounted(async () => {
    if (cachedWorldGeo) {
      geo.value = cachedWorldGeo
      return
    }
    const baseURL = (useRuntimeConfig().app.baseURL || '/').replace(/\/$/, '')
    const loaded = await loadWorldGeo(`${baseURL}/geo/world-countries.geo.json`)
    if (loaded)
      geo.value = loaded
  })

  return geo
}
