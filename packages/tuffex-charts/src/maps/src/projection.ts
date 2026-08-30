// Constants and window math ported from Cloudflare kumo (MIT) —
// packages/kumo/src/components/chart/Maps.tsx.

import type { GeoProjection } from 'd3-geo'
import { geoEquirectangular, geoMercator } from 'd3-geo'

/**
 * Mercator's latitude cutoff. It stretches toward ±90° to infinity, so we
 * clamp at ±85.0511° — otherwise Antarctica projects to an unbounded height
 * and the whole map shrinks to fit.
 */
export const MERCATOR_MAX_LAT = 85.0511

/**
 * Default displayed window `[[west, north], [east, south]]`. Crops the empty
 * Arctic and most of Antarctica so populated landmasses fill the container.
 */
export const DEFAULT_BOUNDING_COORDS: [[number, number], [number, number]] = [
  [-180, 80],
  [180, -58],
]

/** Furthest roam zoom-in, as a multiple of the auto-fit scale. */
export const MAX_ZOOM_FACTOR = 8

/**
 * Fresh Mercator (the default web-map look). d3's mercator auto-clips to the
 * square world, which caps latitudes at ±85.05° — the clamp kumo implements
 * by hand comes built in here.
 */
export function createDefaultProjection(): GeoProjection {
  return geoMercator()
}

/**
 * Resolves the effective projection: `undefined` → clamped Mercator default,
 * `null` → raw lng/lat plotting (equirectangular).
 */
export function resolveProjection(projection: GeoProjection | null | undefined): GeoProjection {
  if (projection === null)
    return geoEquirectangular()
  return projection ?? createDefaultProjection()
}

/**
 * GeoJSON feature outlining the displayed window, used to fit the projection.
 * A MultiPoint of densified edge samples on purpose: spherical polygons carry
 * winding-order semantics (a reversed ring means its complement), while a
 * point cloud just fits the projected bounding box of the window outline.
 */
export function boundingWindowFeature(
  [[west, north], [east, south]]: [[number, number], [number, number]],
): GeoJSON.Feature {
  const clampLat = (lat: number): number =>
    Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat))
  const n = clampLat(north)
  const s = clampLat(south)
  const steps = 20
  const points: Array<[number, number]> = []
  for (let i = 0; i <= steps; i++) {
    const lng = west + (i / steps) * (east - west)
    points.push([lng, s], [lng, n])
  }
  for (let i = 0; i <= steps; i++) {
    const lat = s + (i / steps) * (n - s)
    points.push([west, lat], [east, lat])
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiPoint', coordinates: points },
  }
}

/**
 * Aspect ratio (`width / height`) of the projected window: width measured at
 * the equator (clamped into the window), height down the central meridian.
 * Exact for cylindrical projections, close enough for curved ones.
 */
export function projectedAspect(
  projection: GeoProjection,
  [[west, north], [east, south]]: [[number, number], [number, number]] = DEFAULT_BOUNDING_COORDS,
): number {
  const midLat = Math.min(north, Math.max(south, 0))
  const project = (point: [number, number]): [number, number] =>
    projection(point) ?? [0, 0]
  const w = Math.abs(project([east, midLat])[0] - project([west, midLat])[0])
  const h = Math.abs(project([0, north])[1] - project([0, south])[1])
  return w > 0 && h > 0 ? w / h : 16 / 9
}

/**
 * Fits the projection (in place) so the displayed window fills
 * `width × height`.
 */
export function fitProjectionToWindow(
  projection: GeoProjection,
  width: number,
  height: number,
  bounds: [[number, number], [number, number]] = DEFAULT_BOUNDING_COORDS,
): GeoProjection {
  return projection.fitExtent(
    [[0, 0], [width, height]],
    boundingWindowFeature(bounds) as never,
  )
}
